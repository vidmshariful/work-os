-- Moving a project between lists, or into and out of a parent, is a real
-- change to how work is organised, but log_project_activity only recorded
-- status, owner, and due date. A move left no trace.
--
-- This replaces the function body, adding two verbs. No trigger is created or
-- dropped: t2_projects_activity already points at this function, so the new
-- clauses take effect on the next update.
--
-- Wall note: list names and project titles are internal and brand-blind, and
-- activity_log is already readable by any member of the workspace. Nothing
-- here widens what the wall exposes.

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

  -- Moved between lists, or out of every list.
  if new.list_id is distinct from old.list_id then
    select name into to_name from project_lists where id = new.list_id;
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (new.workspace_id, auth.uid(), 'project', new.id, 'list_changed',
            jsonb_build_object('to_name', to_name));
  end if;

  -- Became a sub-project, or was promoted back to top level. Logged for the
  -- same reason as a list move: it changes where the work lives.
  if new.parent_project_id is distinct from old.parent_project_id then
    select title into to_name from projects where id = new.parent_project_id;
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, verb, detail)
    values (new.workspace_id, auth.uid(), 'project', new.id, 'parent_changed',
            jsonb_build_object('to_name', to_name));
  end if;

  return new;
end;
$$;

-- The function is SECURITY DEFINER and only ever runs as a trigger, so no
-- caller needs EXECUTE. Re-asserted because CREATE OR REPLACE restores the
-- default PUBLIC grant.
revoke execute on function log_project_activity() from public;
