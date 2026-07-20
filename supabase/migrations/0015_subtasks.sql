-- Phase A, slice 3: subtasks, one level deep.
-- A task may have a parent. The parent is a container; its subtasks are real
-- tasks that open, assign, and move like any other. Depth is capped at one by
-- a trigger, and KPI counts only leaves so a parent never double-counts.

alter table tasks add column parent_task_id uuid references tasks(id) on delete cascade;
create index idx_tasks_parent on tasks (parent_task_id);

-- Enforce one level: a subtask's parent may not itself be a subtask, and a
-- task that already has subtasks may not be demoted into one.
create or replace function tasks_guard_one_level()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'A task cannot be its own parent';
    end if;
    if exists (select 1 from tasks p where p.id = new.parent_task_id and p.parent_task_id is not null) then
      raise exception 'Subtasks are one level deep';
    end if;
    if exists (select 1 from tasks c where c.parent_task_id = new.id) then
      raise exception 'A task with subtasks cannot become a subtask';
    end if;
  end if;
  return new;
end;
$$;

create trigger t5_tasks_one_level
  before insert or update on tasks
  for each row execute function tasks_guard_one_level();

-- Reparenting is structural, so keep it out of a contributor's reach: extend
-- the guard so a contributor still changes only status and description.
create or replace function tasks_guard_contributor()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
begin
  if auth.uid() is null then return new; end if;  -- service role paths
  select p.workspace_id into ws from projects p where p.id = new.project_id;
  if app_can_assign(ws) then return new; end if;
  if new.title is distinct from old.title
     or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date
     or new.priority is distinct from old.priority
     or new.phase_id is distinct from old.phase_id
     or new.parent_task_id is distinct from old.parent_task_id
     or new.project_id is distinct from old.project_id then
    raise exception 'You can change only the status and description of your own task';
  end if;
  return new;
end;
$$;

-- KPI: leaf tasks only. A parent (a task that has subtasks) is excluded from
-- per-person metrics so completion, cycle time, and revisions count the work
-- once, at the leaves.
create or replace view v_kpi_person with (security_invoker = true) as
select
  p.workspace_id,
  t.assignee_id as profile_id,
  count(*) filter (where t.status = 'done') as tasks_completed,
  count(*) filter (where t.status not in ('done')) as tasks_open,
  count(*) filter (where t.status = 'done' and t.completed_at > now() - interval '30 days') as completed_30d,
  round(avg(t.completed_at::date - t.created_at::date) filter (where t.status = 'done'), 1) as avg_cycle_days,
  round(
    (count(*) filter (where t.status = 'done' and t.due_date is not null and t.completed_at::date <= t.due_date))::numeric
    / nullif(count(*) filter (where t.status = 'done' and t.due_date is not null), 0), 3
  ) as on_time_rate,
  coalesce(sum(t.revision_count), 0) as revisions_total,
  round(
    (sum(t.revision_count) filter (where t.status = 'done'))::numeric
    / nullif(count(*) filter (where t.status = 'done'), 0), 2
  ) as revision_rate
from tasks t
join projects p on p.id = t.project_id
where t.assignee_id is not null
  and not exists (select 1 from tasks c where c.parent_task_id = t.id)
group by p.workspace_id, t.assignee_id;
