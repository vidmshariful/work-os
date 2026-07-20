-- Phase A, slice 2: activity history.
-- A workspace-scoped audit trail surfaced on task and project detail. Rows are
-- written only by triggers (security definer); the app can read but never
-- insert. Everything logged here is brand-blind: task and project facts carry
-- no client identity, so the log is safe for below-wall members to read.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id),
  entity_type text not null,          -- 'task' | 'project'
  entity_id uuid not null,
  verb text not null,                 -- 'status_changed' | 'reassigned' | ...
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_entity on activity_log (entity_type, entity_id, created_at desc);
create index idx_activity_ws on activity_log (workspace_id, created_at desc);

alter table activity_log enable row level security;

-- Members of the workspace read. There is no insert policy: writes happen
-- only inside the security-definer trigger functions below.
create policy activity_select on activity_log for select to authenticated
  using (app_is_member(workspace_id));

-- ---- tasks: log status, assignee, and due-date changes ----

create or replace function log_task_activity()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
  to_name text;
begin
  select p.workspace_id into ws from projects p where p.id = new.project_id;

  if new.status is distinct from old.status then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (ws, auth.uid(), 'task', new.id, 'status_changed',
            jsonb_build_object('to', new.status));
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select full_name into to_name from profiles where id = new.assignee_id;
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (ws, auth.uid(), 'task', new.id, 'reassigned',
            jsonb_build_object('to_name', to_name));
  end if;

  if new.due_date is distinct from old.due_date then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (ws, auth.uid(), 'task', new.id, 'due_changed',
            jsonb_build_object('to', new.due_date));
  end if;

  return new;
end;
$$;

create trigger t4_tasks_activity
  after update on tasks
  for each row execute function log_task_activity();

-- ---- projects: log status, owner, and date changes ----

create or replace function log_project_activity()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  to_name text;
begin
  if new.status is distinct from old.status then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (new.workspace_id, auth.uid(), 'project', new.id, 'status_changed',
            jsonb_build_object('to', new.status));
  end if;

  if new.owner_id is distinct from old.owner_id then
    select full_name into to_name from profiles where id = new.owner_id;
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (new.workspace_id, auth.uid(), 'project', new.id, 'owner_changed',
            jsonb_build_object('to_name', to_name));
  end if;

  if new.due_date is distinct from old.due_date then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (new.workspace_id, auth.uid(), 'project', new.id, 'due_changed',
            jsonb_build_object('to', new.due_date));
  end if;

  return new;
end;
$$;

create trigger t2_projects_activity
  after update on projects
  for each row execute function log_project_activity();
