-- Phase D1: departments as spaces.
-- Hierarchy: Department -> List (optional) -> Project -> Task.
-- Access is scoped: executives see every department; everyone else sees only
-- the departments they are a member of. This is a "need to know" org layer
-- that sits ON TOP OF the wall, which still masks client identity regardless.
-- Department and list names are internal and must stay brand-blind, same rule
-- as project titles.

-- ---- tables ----

create table departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  accent_color text not null default '#8A94A3',
  sort_order int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table department_members (
  department_id uuid not null references departments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, profile_id)
);
create index idx_department_members_profile on department_members (profile_id);

create table project_lists (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_project_lists_department on project_lists (department_id);

alter table projects add column department_id uuid references departments(id) on delete set null;
alter table projects add column list_id uuid references project_lists(id) on delete set null;
create index idx_projects_department on projects (department_id);
create index idx_projects_list on projects (list_id);

-- ---- visibility helper ----
-- True when the caller may see a department: executives see all; everyone
-- else must be an explicit member.
create or replace function app_can_see_department(dept uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select
    exists (
      select 1 from departments d
      where d.id = dept and app_archetype(d.workspace_id) = 'executive'
    )
    or exists (
      select 1 from department_members dm
      where dm.department_id = dept and dm.profile_id = auth.uid()
    );
$$;

-- ---- RLS ----

alter table departments        enable row level security;
alter table department_members enable row level security;
alter table project_lists      enable row level security;

-- departments: visible to those who can see them; executives manage the set.
create policy departments_select on departments for select to authenticated
  using (app_can_see_department(id));
create policy departments_insert on departments for insert to authenticated
  with check (app_archetype(workspace_id) = 'executive');
create policy departments_update on departments for update to authenticated
  using (app_archetype(workspace_id) = 'executive')
  with check (app_archetype(workspace_id) = 'executive');
create policy departments_delete on departments for delete to authenticated
  using (app_archetype(workspace_id) = 'executive');

-- department roster: visible to members and executives; executives manage it.
create policy department_members_select on department_members for select to authenticated
  using (app_can_see_department(department_id));
create policy department_members_insert on department_members for insert to authenticated
  with check (exists (
    select 1 from departments d
    where d.id = department_members.department_id and app_archetype(d.workspace_id) = 'executive'
  ));
create policy department_members_delete on department_members for delete to authenticated
  using (exists (
    select 1 from departments d
    where d.id = department_members.department_id and app_archetype(d.workspace_id) = 'executive'
  ));

-- lists: visible with the department; leads and up write them.
create policy project_lists_select on project_lists for select to authenticated
  using (app_can_see_department(department_id));
create policy project_lists_insert on project_lists for insert to authenticated
  with check (exists (
    select 1 from departments d
    where d.id = project_lists.department_id and app_can_assign(d.workspace_id)
  ));
create policy project_lists_update on project_lists for update to authenticated
  using (exists (
    select 1 from departments d
    where d.id = project_lists.department_id and app_can_assign(d.workspace_id)
  ))
  with check (exists (
    select 1 from departments d
    where d.id = project_lists.department_id and app_can_assign(d.workspace_id)
  ));
create policy project_lists_delete on project_lists for delete to authenticated
  using (exists (
    select 1 from departments d
    where d.id = project_lists.department_id and app_can_assign(d.workspace_id)
  ));

-- ---- tighten project and task visibility by department ----
-- A project with no department stays visible to every member (a safe fallback
-- for unfiled work); a filed project is visible only to the department.
drop policy projects_select on projects;
create policy projects_select on projects for select to authenticated
  using (
    app_is_member(workspace_id)
    and (department_id is null or app_can_see_department(department_id))
  );

drop policy tasks_select on tasks;
create policy tasks_select on tasks for select to authenticated using (
  exists (
    select 1 from projects p
    where p.id = tasks.project_id
      and app_is_member(p.workspace_id)
      and (p.department_id is null or app_can_see_department(p.department_id))
  )
);

-- ---- backfill existing workspaces (no-op on a fresh database) ----

insert into departments (workspace_id, name, slug, accent_color, sort_order, is_default)
select w.id, d.name, d.slug, d.accent, d.ord, d.is_default
from workspaces w
cross join (values
  ('Animation Studio', 'animation-studio', '#7C5CFC', 0, true),
  ('Video Editing',    'video-editing',    '#3B6FF6', 1, false),
  ('Marketing',        'marketing',        '#16A34A', 2, false),
  ('Operations',       'operations',       '#8A94A3', 3, false)
) as d(name, slug, accent, ord, is_default)
on conflict (workspace_id, slug) do nothing;

-- File every existing project into its workspace's default department.
update projects p
set department_id = (
  select d.id from departments d
  where d.workspace_id = p.workspace_id and d.is_default limit 1
)
where p.department_id is null;

-- Bootstrap department membership from roles so scoped access works on day one.
insert into department_members (department_id, profile_id)
select d.id, m.profile_id
from memberships m
join departments d on d.workspace_id = m.workspace_id
where m.is_active and (
     (d.slug = 'animation-studio' and m.role in ('animator','animation_lead','designer','design_lead','creative_lead'))
  or (d.slug = 'video-editing'    and m.role in ('editor','editing_lead','creative_lead'))
  or (d.slug = 'marketing'        and m.role in ('marketer','marketing_manager'))
  or (d.slug = 'operations'       and m.role in ('ops_manager','ceo','cfo'))
)
on conflict do nothing;
