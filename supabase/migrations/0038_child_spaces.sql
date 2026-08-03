-- A space can live inside another space, one level deep.
--
-- WHY THIS EXISTS. "Not everyone can see every folder." A folder from 0037
-- cannot answer that: project_folders has no roster of its own, and the only
-- thing that decides who sees a list is project_lists_select, which reads
-- app_can_see_department(department_id) and nothing else. Giving a folder its
-- own roster means teaching that policy about folders, and that policy is
-- protected. So instead of inventing a second visibility mechanism, this
-- migration reuses the one that already works: a folder that needs its own
-- roster is not a project_folders row at all. It is a space, filed under
-- another space.
--
-- Production > Scripting Area becomes a departments row whose
-- parent_department_id is Production. Its lists carry department_id = the
-- child, its projects carry department_id = the child, and every existing
-- policy gates them through app_can_see_department() exactly as it gates
-- everything else. Membership is department_members. Nothing new is invented.
--
-- WHAT THIS COSTS. Two kinds of folder now exist. A project_folders row is
-- decoration: it groups lists that everyone in the space can already see. A
-- child department is a boundary: it groups lists that only its own members
-- can see. They look the same in the sidebar and they are not the same
-- object, they are not in the same table, and one of them cannot be
-- converted into the other by an UPDATE. Anyone reading this schema has to
-- hold both in their head. That is the price of not touching a protected
-- policy, and it is stated here rather than discovered later.
--
-- NOT ONE POLICY IS CREATED, DROPPED, OR ALTERED BY THIS FILE. No policy on
-- departments, department_members, project_lists, project_folders, projects,
-- or tasks. app_can_see_department() is not redefined. projects_select and
-- project_lists_select are not read, let alone written. departments already
-- carries four policies, and a new column on a table inherits them; a child
-- department is selected, inserted, updated, and deleted under the same
-- rules a top-level one always has been.
--
-- Wall note: a space name is internal organisation, on exactly the footing
-- 0017 put it and 0036 restated. Nothing here carries client identity, no
-- client column is read, and v_clients is untouched.
--
-- Additive only. This file changes no existing row: parent_department_id is
-- null everywhere until someone files a space, so every reader sees exactly
-- what they saw before it ran.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE, deliberately, and read the consequence before changing
-- it. Deleting a space deletes the spaces filed inside it, which mirrors
-- 0037: deleting a space already deletes its folders and its lists. The two
-- alternatives are both worse. RESTRICT breaks workspace deletion, because
-- workspaces cascade into departments and RESTRICT is checked per row rather
-- than at end of statement, so a parent and child going in the same statement
-- would raise. SET NULL silently promotes a restricted space to top level,
-- which is a privacy change made by a foreign key.
--
-- The consequence CASCADE carries is in the unknowns, not hidden here:
-- projects.department_id is ON DELETE SET NULL from 0017, and projects_select
-- treats a null department as visible to every member of the workspace. So
-- deleting a restricted child space unfiles its projects into workspace-wide
-- visibility, and deleting the PARENT does the same thing without ever naming
-- the child. deleteDepartment has to grow a guard for that. Postgres cannot
-- express "refuse unless the caller has been told what they are about to
-- publish".
alter table departments
  add column if not exists parent_department_id uuid
    references departments(id) on delete cascade;

-- Children are read by parent, in sort order, on every render of the space
-- page and the sidebar. Partial because the overwhelming majority of rows
-- are top level and never match. Mirrors idx_project_lists_folder from 0037.
create index if not exists idx_departments_parent
  on departments (parent_department_id, sort_order)
  where parent_department_id is not null;

-- ---------------------------------------------------------------------------
-- 2. A child space can never be the default space
-- ---------------------------------------------------------------------------
-- createProject files work that names no space into the default space, and
-- clients_file_default_department() (0018, rewritten in 0025) falls back to it
-- for every handoff whose origin maps nowhere. If the default were a
-- restricted child, every unfiled project and every automated handoff would
-- land inside a padlock, visible to a handful of people, with no one deciding
-- that. The same argument 0036 made for departments_default_not_archived_check
-- applies here, so the rule is held in the same place: in Postgres, where it
-- cannot be talked out of it.
--
-- setDefaultDepartment must filter its candidates to top-level spaces.
-- Otherwise an executive picking a child gets a raw 23514 surfaced as "Could
-- not set the default department", which is true and useless.
alter table departments
  drop constraint if exists departments_child_not_default_check;

alter table departments
  add constraint departments_child_not_default_check
  check (parent_department_id is null or not is_default);

-- ---------------------------------------------------------------------------
-- 3. One level deep, held by a trigger
-- ---------------------------------------------------------------------------
-- Same shape and the same reasoning as projects_guard_one_level in 0025. A
-- check constraint cannot express this: the rule is about the parent's row,
-- not this one.
--
-- SECURITY DEFINER, which 0025 did not need and this does. departments has
-- RLS, and a plain trigger function's queries run under the caller's
-- policies. A row the caller cannot select would read as absent, and the
-- fourth check below ("already contains spaces") would then pass by not
-- seeing the children it is asking about. Definer makes the guard see the
-- whole table, which is the only way a depth guard is a guard. search_path is
-- pinned for the same reason every definer function in 0002 pins it.
create or replace function departments_guard_one_level()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  parent_ws     uuid;
  parent_parent uuid;
begin
  if new.parent_department_id is null then
    return new;
  end if;

  if new.parent_department_id = new.id then
    raise exception 'A space cannot be its own parent';
  end if;

  select d.workspace_id, d.parent_department_id
    into parent_ws, parent_parent
    from departments d
   where d.id = new.parent_department_id;

  if parent_ws is null then
    raise exception 'The parent space does not exist';
  end if;

  -- The workspace is the outermost boundary in this schema and nothing is
  -- allowed to straddle it. This is the departments-level equivalent of the
  -- composite foreign key 0037 put on project_lists.
  if parent_ws <> new.workspace_id then
    raise exception 'A space and its parent must be in the same workspace';
  end if;

  if parent_parent is not null then
    raise exception 'Spaces nest one level deep';
  end if;

  if exists (select 1 from departments c where c.parent_department_id = new.id) then
    raise exception 'A space that already contains spaces cannot be filed inside another';
  end if;

  return new;
end;
$$;

drop trigger if exists t_departments_one_level on departments;
create trigger t_departments_one_level
  before insert or update on departments
  for each row execute function departments_guard_one_level();

-- ---------------------------------------------------------------------------
-- 4. No project_folders inside a child space
-- ---------------------------------------------------------------------------
-- 0037 promised folders are one level deep and refused to add
-- parent_folder_id for it. A child space renders as a folder, so a
-- project_folders row inside a child space is that second level arriving
-- through the side door: the sidebar would have to draw a folder inside a
-- folder, and the space page's folderRank sort would have to become a tree.
-- Refuse it at the table.
--
-- This is the one place this file constrains something 0037 built, and it is
-- allowed to: project_folders is this author's, unprotected, and no policy on
-- it is touched here either. Drop this trigger and folder-in-folder becomes a
-- rendering problem, not a data problem.
--
-- The UI side of the same rule: the space page for a child must not offer
-- "New folder". createFolder should return a sentence rather than let this
-- exception reach the user.
create or replace function project_folders_guard_depth()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if exists (
    select 1 from departments d
     where d.id = new.department_id
       and d.parent_department_id is not null
  ) then
    raise exception 'A folder cannot be added inside a space that is itself filed in a space';
  end if;
  return new;
end;
$$;

drop trigger if exists t_project_folders_depth on project_folders;
create trigger t_project_folders_depth
  before insert or update on project_folders
  for each row execute function project_folders_guard_depth();

-- ---------------------------------------------------------------------------
-- 5. What is deliberately absent
-- ---------------------------------------------------------------------------
-- No backfill. Scripting Area is created by an executive through the normal
-- create-space path with a parent, and its lists are moved in by
-- moveListToSpace, which already carries the projects across and already
-- clears folder_id. Turning today's padlock-shaped folders into child spaces
-- is a data decision, not a migration.
--
-- No view. A v_department_tree would be a third way to ask the same question
-- and would still be security_invoker, so it would return precisely what a
-- plain select on departments already returns. The tree is assembled in the
-- one fetch the workspace layout already does.
--
-- No change to departments_select. It reads "executive, or a
-- department_members row on this exact row", which is already the right
-- answer for a child: a member of the child sees the child, a member of only
-- the parent does not. Widening it so a child's members can also see the
-- parent's name would hand them a parent space page that loads with zero
-- lists and zero projects, because project_lists_select and projects_select
-- would still deny every row in it. An empty space that is not empty is a
-- worse lie than a missing crumb.
