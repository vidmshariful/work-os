-- An overdue to-do says so once, not every morning until the end of time.
--
-- WHAT WAS WRONG. notify_due_personal_todos ran daily and re-notified any
-- to-do still overdue, guarded only by "have we reminded today". So a to-do
-- nobody got to kept generating one notification a day forever. Two of them,
-- overdue since mid-July, had produced 40 and 38 notifications: 78 of the 121
-- notifications in the entire system, every one unread. The feed was not
-- broken so much as drowned, and a feed nobody can read is a feed nobody
-- reads, including for the things that matter.
--
-- THE FIX. reminded_on stops meaning "the day we last shouted" and starts
-- meaning "the due date we have already covered". A to-do is reminded about
-- once per due date, so it goes quiet after the first, and re-arms by itself
-- if somebody reschedules it. That is the whole change: same job, same
-- schedule, one row per to-do instead of one per day.

create or replace function notify_due_personal_todos()
returns void language plpgsql security definer
set search_path = public as $$
begin
  insert into notifications (profile_id, workspace_id, type, title, body, entity_type, entity_id)
  select t.profile_id, t.workspace_id, 'todo_due',
    case when t.due_date < current_date then 'Overdue to-do' else 'To-do due today' end,
    t.title, 'todo', t.id
  from personal_todos t
  where t.due_date is not null
    and t.due_date <= current_date
    and t.is_done = false
    -- Once per due date. Moving the date is a new promise and earns a new
    -- reminder; leaving it alone does not.
    and t.reminded_on is distinct from t.due_date;

  update personal_todos t set reminded_on = t.due_date
  where t.due_date is not null
    and t.due_date <= current_date
    and t.is_done = false
    and t.reminded_on is distinct from t.due_date;
end;
$$;

revoke execute on function notify_due_personal_todos() from anon, authenticated;

-- ---- clear the backlog the old rule produced --------------------------------

-- Each to-do keeps its most recent reminder, so nothing is forgotten, and the
-- older copies of the same message go.
delete from notifications n
where n.type = 'todo_due'
  and n.id not in (
    select distinct on (entity_id) id
    from notifications
    where type = 'todo_due'
    order by entity_id, created_at desc
  );

-- Bring the surviving to-dos in line with what reminded_on now means, so the
-- job does not immediately send one more for a date already covered.
update personal_todos t
set reminded_on = t.due_date
where t.due_date is not null
  and t.due_date <= current_date
  and t.is_done = false
  and exists (
    select 1 from notifications n
    where n.type = 'todo_due' and n.entity_id = t.id
  );
