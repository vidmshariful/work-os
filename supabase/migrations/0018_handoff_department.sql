-- Phase D4: auto-file the handoff-scaffolded project into a department.
-- This runs as a separate after-insert trigger so the large clients_handoff
-- function stays untouched. Trigger order is alphabetical, so t2 runs after
-- t1_clients_handoff has already created the project. The client's origin maps
-- to a department by its stable slug (slugs never change on rename), falling
-- back to the workspace's default department.

create or replace function clients_file_default_department()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  dept_id uuid;
  target_slug text;
begin
  target_slug := case new.origin
    when 'ghl_video' then 'video-editing'
    when 'ghl_animation' then 'animation-studio'
    else null
  end;

  if target_slug is not null then
    select id into dept_id from departments
      where workspace_id = new.workspace_id and slug = target_slug limit 1;
  end if;
  if dept_id is null then
    select id into dept_id from departments
      where workspace_id = new.workspace_id and is_default limit 1;
  end if;

  if dept_id is not null then
    update projects set department_id = dept_id
      where client_id = new.id and department_id is null;
  end if;
  return new;
end;
$$;

create trigger t2_clients_file_dept
  after insert on clients
  for each row execute function clients_file_default_department();
