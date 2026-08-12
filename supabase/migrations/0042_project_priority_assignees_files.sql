-- Three things a ClickUp row shows that a project row could not: a priority
-- flag, more than one face, and a paperclip when something is attached.
--
-- Not one character of app_can_see_department, projects_select or
-- project_lists_select changes. The new table inherits the project's
-- visibility, and the new function re-uses the same two helpers the projects
-- policy already calls rather than inventing a second rule.

-- ---------------------------------------------------------------------------
-- 1. Priority
-- ---------------------------------------------------------------------------
-- An integer, 0 normal, 1 high, 2 urgent, because that is exactly what
-- tasks.priority already is and what PriorityTag already renders. A second
-- vocabulary for the same idea would mean two things to learn and two things
-- to keep in step.

alter table projects add column if not exists priority smallint not null default 0;

alter table projects drop constraint if exists projects_priority_check;
alter table projects
  add constraint projects_priority_check check (priority between 0 and 2);

-- The list sorts and filters by it, and 0 is most rows, so the index only
-- covers the ones worth finding.
create index if not exists idx_projects_priority
  on projects (workspace_id, priority)
  where priority > 0;

-- ---------------------------------------------------------------------------
-- 2. Extra assignees
-- ---------------------------------------------------------------------------
-- projects.owner_id stays exactly what it is: the one person answerable for
-- the project, used by every existing filter, notification and permission
-- check. This table is the rest of the people working on it, which is what
-- the stack of faces on a row shows. Keeping them apart means none of the
-- existing owner logic has to learn about lists of people.

create table if not exists project_assignees (
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists idx_project_assignees_profile
  on project_assignees (profile_id);

alter table project_assignees enable row level security;

-- Visibility is the project's, inherited by an inline EXISTS so projects_select
-- runs as the reader. The same trap project_field_values avoided in 0038
-- applies here: a SECURITY DEFINER helper would bypass RLS and hand out rows
-- for projects the reader cannot open. The EXISTS must stay inline.
drop policy if exists project_assignees_select on project_assignees;
create policy project_assignees_select on project_assignees for select to authenticated
  using (exists (select 1 from projects p where p.id = project_assignees.project_id));

-- Assigning is editing the project, so it takes the rule projects_update
-- takes: a manager on any project, or the owner on theirs. And the person
-- being assigned has to be an active member of that project's workspace.
drop policy if exists project_assignees_insert on project_assignees;
create policy project_assignees_insert on project_assignees for insert to authenticated
  with check (
    exists (
      select 1 from projects p
      where p.id = project_assignees.project_id
        and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
        and exists (
          select 1 from memberships m
          where m.workspace_id = p.workspace_id
            and m.profile_id = project_assignees.profile_id
            and m.is_active
        )
    )
  );

drop policy if exists project_assignees_delete on project_assignees;
create policy project_assignees_delete on project_assignees for delete to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = project_assignees.project_id
        and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Attachment counts
-- ---------------------------------------------------------------------------
-- Files live in storage, not in a table, so a row cannot count them with a
-- join. Listing the bucket per project would be one API call per row, which
-- is fifteen on a space page, so instead this reads storage.objects once for
-- the whole page.
--
-- SECURITY DEFINER is required, because storage.objects is not readable by
-- authenticated. That makes the visibility check this function's own job, so
-- it repeats the projects policy exactly: workspace member, and the space is
-- one they can see. A project id the caller cannot open returns no row at
-- all, not a zero, so nothing here confirms that a project exists.
--
-- Uploads are written to `<workspace_id>/<project_id>/<file>` by
-- lib/actions/projects.ts, which is where the path split comes from.

create or replace function project_file_counts(ids uuid[])
returns table (project_id uuid, files bigint)
language sql security definer stable
set search_path = public, storage as $$
  select p.id, count(o.id)
  from projects p
  left join storage.objects o
    on o.bucket_id = 'project-files'
   and o.name like p.workspace_id::text || '/' || p.id::text || '/%'
  where p.id = any(ids)
    and app_is_member(p.workspace_id)
    and (p.department_id is null or app_can_see_department(p.department_id))
  group by p.id;
$$;

revoke all on function project_file_counts(uuid[]) from public;
grant execute on function project_file_counts(uuid[]) to authenticated;
