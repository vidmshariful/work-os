-- Spaces gain a folder, and lists gain an archive.
--
-- Two changes in one file because they are one idea: a space with seventy
-- flat lists is unreadable, and roughly a fifth of those lists are not live
-- work at all. Folders group what is real. Archiving removes what is not.
-- Shipping the folder without the archive would mean modelling three
-- "Archive (X)" folders as real structure, which is the mistake being fixed.
--
-- THE VISIBILITY RULE IS UNCHANGED. Not one character of
-- app_can_see_department(), projects_select, or project_lists_select is
-- touched, and none needs to be. project_lists keeps its department_id, so
-- the policy that reads it still reads it. A folder lives in exactly one
-- space, the same space its lists live in, so the space remains the only
-- thing that decides who sees what. projects gains no column at all: a
-- project's folder is reached through its list and is never queried by a
-- policy.
--
-- That "no policy change" claim rests entirely on the composite foreign key
-- below. Read the comment on it before altering it.
--
-- Wall note: a folder name is internal organisation, exactly like a list
-- name. Nothing here carries client identity, so the wall is untouched.

-- ---------------------------------------------------------------------------
-- 1. Lists can be archived
-- ---------------------------------------------------------------------------
-- Mirrors departments.archived_at from 0036, including its posture:
-- archiving is a UI state, not a permission. An archived list keeps every
-- project in it, keeps its members' access, and still opens from a direct
-- link. It simply stops competing for attention in the sidebar and on the
-- space page.

alter table project_lists
  add column if not exists archived_at timestamptz;

-- The space page and the sidebar both read lists by space in sort_order, and
-- both will now filter to the active ones. Mirrors idx_departments_active.
create index if not exists idx_project_lists_active
  on project_lists (department_id, sort_order)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. Folders
-- ---------------------------------------------------------------------------
-- One level deep, and deliberately so. There is no parent_folder_id: nesting
-- folders would need a depth guard trigger of its own and would re-open the
-- recursion question that 0025 settled for sub-projects. If folders ever need
-- to nest, that is a new migration and a new decision, not an accident.
--
-- Folders are optional. A list with folder_id null sits directly in the
-- space, which is exactly where every list sits today, so this migration
-- changes nothing about existing rows.
--
-- No archived_at here on purpose. The three "Archive (X)" folders this
-- feature replaces become archived LISTS, not archived folders, so a folder
-- archive would be a fourth archive axis earning its keep in no real case.
-- Deleting a folder unfiles its lists, which covers the rest.

create table if not exists project_folders (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  -- Same seven palette keys as project_lists.color in 0035, so a folder
  -- cannot be given a colour the design system has no token for.
  color text,
  created_at timestamptz not null default now(),
  -- Required by the composite foreign key from project_lists. A plain
  -- primary key on id is not enough to reference (id, department_id).
  unique (id, department_id)
);

alter table project_folders
  drop constraint if exists project_folders_color_check;

alter table project_folders
  add constraint project_folders_color_check
  check (color is null or color in ('blue', 'violet', 'green', 'amber', 'rose', 'teal', 'gray'));

create index if not exists idx_project_folders_space
  on project_folders (department_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Lists point at a folder, compositely
-- ---------------------------------------------------------------------------

alter table project_lists
  add column if not exists folder_id uuid;

create index if not exists idx_project_lists_folder
  on project_lists (folder_id, sort_order)
  where folder_id is not null;

alter table project_lists
  drop constraint if exists project_lists_folder_same_space_fk;

-- Three details here are load-bearing. Change any of them and something
-- quietly breaks.
--
-- (id, department_id) RATHER THAN (id): this is what makes a cross-space
-- reference unstorable. RLS never validates foreign key targets, and
-- project_lists_update's WITH CHECK only inspects department_id, so with a
-- single-column FK a list in space A could legally name a folder in space B.
-- The write would succeed, and a reader with access to A would then see a
-- list grouped under a folder project_folders_select hides from them. The
-- obvious repair is to join project_lists_select through project_folders,
-- which would modify a protected policy. This constraint removes the need.
--
-- ON DELETE SET NULL (folder_id): the column list is Postgres 15+ and is not
-- optional. A bare ON DELETE SET NULL nulls every column in the key,
-- including department_id, which is NOT NULL. Deleting a folder would then
-- raise a not-null violation instead of unfiling its lists, the exact
-- opposite of the intended behaviour. Verified against the live database:
-- server_version 17.6.
--
-- ON UPDATE NO ACTION: cascading looks convenient and is a trap. It would
-- rewrite a list's department_id when a folder moves space, dragging lists
-- across a visibility boundary while leaving their projects behind in the old
-- space. That is the precise split moveListToSpace was written to prevent, so
-- the write should fail loudly and be forced through an action that carries
-- the projects too.
alter table project_lists
  add constraint project_lists_folder_same_space_fk
  foreign key (folder_id, department_id)
  references project_folders (id, department_id)
  on delete set null (folder_id)
  on update no action;

-- ---------------------------------------------------------------------------
-- 4. RLS, copied from project_lists one for one
-- ---------------------------------------------------------------------------
-- Four new policies, zero modifications. The shapes are lifted verbatim from
-- project_lists in 0017: read if you can see the space, write if you are a
-- lead or above. A table with no considered policy is a bug.
--
-- project_folders_select passes the row's own department_id into a helper
-- that reads departments and department_members, so it never self-queries
-- project_folders. That is what the 0021 and 0027 lesson was about, and it
-- means INSERT ... RETURNING works here.

alter table project_folders enable row level security;

drop policy if exists project_folders_select on project_folders;
create policy project_folders_select on project_folders for select to authenticated
  using (app_can_see_department(department_id));

drop policy if exists project_folders_insert on project_folders;
create policy project_folders_insert on project_folders for insert to authenticated
  with check (exists (
    select 1 from departments d
    where d.id = project_folders.department_id and app_can_assign(d.workspace_id)
  ));

drop policy if exists project_folders_update on project_folders;
create policy project_folders_update on project_folders for update to authenticated
  using (exists (
    select 1 from departments d
    where d.id = project_folders.department_id and app_can_assign(d.workspace_id)
  ))
  with check (exists (
    select 1 from departments d
    where d.id = project_folders.department_id and app_can_assign(d.workspace_id)
  ));

drop policy if exists project_folders_delete on project_folders;
create policy project_folders_delete on project_folders for delete to authenticated
  using (exists (
    select 1 from departments d
    where d.id = project_folders.department_id and app_can_assign(d.workspace_id)
  ));

-- Note for whoever writes createFolder: project_folders_insert gates on the
-- workspace archetype while project_folders_select gates on space
-- membership, so a lead who is not a member of a space can insert a folder
-- there and get zero rows back from INSERT ... RETURNING. project_lists has
-- the same asymmetry today, and createList sidesteps it by not calling
-- .select() after the insert. Write createFolder in that shape.
