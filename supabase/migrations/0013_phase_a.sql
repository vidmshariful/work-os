-- Phase A, slice 1: daily-driver CRUD foundations.
-- 1. Projects gain a brief: the first thing a reader sees on the detail page.
-- 2. The contributor guard relaxes just enough to let a person edit the
--    description of their own task. Everything else stays locked: a
--    contributor still cannot touch title, assignee, dates, priority, phase,
--    or move the task to another project. Leads and up are unaffected.

alter table projects add column if not exists brief text;

create or replace function tasks_guard_contributor()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
begin
  if auth.uid() is null then return new; end if;  -- service role paths
  select p.workspace_id into ws from projects p where p.id = new.project_id;
  if app_can_assign(ws) then return new; end if;
  -- Contributor path. RLS has already proven this is the person's own task
  -- (tasks_update only lets a non-manager update rows they are assigned).
  -- They may change status and description; nothing structural.
  if new.title is distinct from old.title
     or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date
     or new.priority is distinct from old.priority
     or new.phase_id is distinct from old.phase_id
     or new.project_id is distinct from old.project_id then
    raise exception 'You can change only the status and description of your own task';
  end if;
  return new;
end;
$$;
