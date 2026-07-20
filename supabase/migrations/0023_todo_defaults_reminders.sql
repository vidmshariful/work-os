-- To-dos: default stages, stage flags, and due-date reminders.
-- Every member gets three default stages (Backlog / In Progress / Done). One
-- stage is the default landing column, one is the done column; checking a
-- to-do moves it to the done column and vice versa (kept in sync by the app).

alter table todo_stages add column is_default boolean not null default false;
alter table todo_stages add column is_done boolean not null default false;
alter table personal_todos add column reminded_on date;

-- Seed the three defaults for one owner+workspace, only if they have none.
create or replace function seed_default_todo_stages(pid uuid, wid uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if exists (select 1 from todo_stages where profile_id = pid and workspace_id = wid) then
    return;
  end if;
  insert into todo_stages (profile_id, workspace_id, name, color, sort_order, is_default, is_done)
  values
    (pid, wid, 'Backlog',     '#8A94A3', 0, true,  false),
    (pid, wid, 'In Progress', '#3B6FF6', 1, false, false),
    (pid, wid, 'Done',        '#16A34A', 2, false, true);
end;
$$;

-- New members get their default stages automatically.
create or replace function memberships_seed_todo_stages()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform seed_default_todo_stages(new.profile_id, new.workspace_id);
  return new;
end;
$$;

create trigger t9_memberships_seed_todo_stages
  after insert on memberships
  for each row execute function memberships_seed_todo_stages();

-- Backfill existing members, then move any stage-less to-dos into Backlog.
do $$
declare m record;
begin
  for m in select profile_id, workspace_id from memberships where is_active loop
    perform seed_default_todo_stages(m.profile_id, m.workspace_id);
  end loop;
end $$;

update personal_todos t set stage_id = (
  select s.id from todo_stages s
  where s.profile_id = t.profile_id and s.workspace_id = t.workspace_id and s.is_default
  limit 1
)
where t.stage_id is null;

-- ---- due-date reminders ----
-- Notifies the owner of any to-do due today or overdue and not done, once per
-- day (reminded_on guards repeats). Security definer so the scheduled job and
-- app can insert notifications.
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
    and (t.reminded_on is null or t.reminded_on < current_date);

  update personal_todos t set reminded_on = current_date
  where t.due_date is not null
    and t.due_date <= current_date
    and t.is_done = false
    and (t.reminded_on is null or t.reminded_on < current_date);
end;
$$;

revoke execute on function notify_due_personal_todos() from anon, authenticated;

-- Schedule it daily at 08:00 UTC. Wrapped so the migration still applies where
-- pg_cron is not enabled; the function can then be scheduled or called later.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('todo-due-reminders', '0 8 * * *', 'select notify_due_personal_todos()');
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
