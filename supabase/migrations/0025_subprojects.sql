-- Phase A: sub-projects. A project may belong to a parent project, one level
-- deep. Use case: a bulk order (an onboarding series) is the parent, and each
-- video inside is its own sub-project with its own owner, tasks, and status.

alter table projects add column parent_project_id uuid references projects(id) on delete set null;
create index idx_projects_parent on projects (parent_project_id);

-- Enforce one level: a sub-project's parent may not itself be a sub-project,
-- and a project that already has sub-projects may not become one.
create or replace function projects_guard_one_level()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.parent_project_id is not null then
    if new.parent_project_id = new.id then
      raise exception 'A project cannot be its own parent';
    end if;
    if exists (select 1 from projects p where p.id = new.parent_project_id and p.parent_project_id is not null) then
      raise exception 'Sub-projects are one level deep';
    end if;
    if exists (select 1 from projects c where c.parent_project_id = new.id) then
      raise exception 'A project with sub-projects cannot become a sub-project';
    end if;
  end if;
  return new;
end;
$$;

create trigger t_projects_one_level
  before insert or update on projects
  for each row execute function projects_guard_one_level();

-- The reorg (below, in the demo script) makes Production the creative space,
-- so both creative origins hand off there. Video editing becomes a list inside
-- Production rather than its own space.
create or replace function clients_file_default_department()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  dept_id uuid;
  target_slug text;
begin
  target_slug := case new.origin
    when 'ghl_video' then 'production'
    when 'ghl_animation' then 'production'
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
