-- Custom fields on projects.
--
-- WHY. The ClickUp workspace this app replaces runs its production process
-- entirely on custom fields: Active Prod. Stage, Project Category, Property,
-- Project Status, Stage Status, plus a script, a Drive link and a Figma link.
-- projects has one free-text `type` column, so that process has nowhere to
-- live. Everything else about the project page is polish until this exists.
--
-- TWO TABLES. project_fields is the definition, project_field_values is the
-- value. A definition belongs to a workspace and may be scoped to one space,
-- so Production can carry an editing stage that Sales never sees.
--
-- THE VISIBILITY RULE IS UNCHANGED, AND THE WAY IT IS INHERITED MATTERS.
-- project_field_values carries no space and no workspace column. Its SELECT
-- policy is an EXISTS against projects, and that subquery runs under the
-- reader's own RLS, so projects_select decides it. A field value is visible
-- exactly when its project is, with no second copy of the rule to drift.
--
-- The trap this deliberately avoids is already shipped elsewhere in this
-- schema: app_project_above_wall in 0012 does its projects lookup inside a
-- SECURITY DEFINER body, which bypasses RLS entirely, and as a result
-- project_intakes enumerates projects the reader cannot open. Verified on the
-- live database: a domain manager who is not a member of Marketing gets 0
-- rows from projects for a Marketing project and 1 row from project_intakes
-- for the same project. Do not write a definer helper here. The EXISTS must
-- stay inline in the policy.
--
-- Not one character of app_can_see_department, projects_select or
-- project_lists_select changes.
--
-- WALL NOTE. A field value is free text on a project, the same footing as
-- projects.title and projects.brief, which are already readable below the
-- wall. Nothing here reads clients or v_clients, so the wall is untouched.
-- The one thing worth saying out loud to whoever configures fields: a field
-- named "Client" would put brand identity somewhere the wall does not
-- protect. That is a policy for people, not something SQL can enforce.

-- ---------------------------------------------------------------------------
-- 1. Definitions
-- ---------------------------------------------------------------------------

create table if not exists project_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Null means the field applies to every space. Set means it only shows on
  -- projects in that one, which is how Production keeps its editing stages
  -- out of Sales.
  department_id uuid references departments(id) on delete cascade,
  name text not null,
  kind text not null,
  -- select and multi_select only: [{ "value": "...", "label": "...",
  -- "color": "amber" }]. Colours are the same seven TagTone keys the rest of
  -- the design system draws with, checked in the application layer because a
  -- jsonb array cannot be constrained to them cheaply here.
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table project_fields drop constraint if exists project_fields_kind_check;
alter table project_fields
  add constraint project_fields_kind_check
  check (kind in ('text', 'long_text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox'));

alter table project_fields drop constraint if exists project_fields_name_len_check;
alter table project_fields
  add constraint project_fields_name_len_check
  check (char_length(name) between 1 and 60);

create index if not exists idx_project_fields_ws
  on project_fields (workspace_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Values
-- ---------------------------------------------------------------------------
-- One row per project per field, and no row at all when the field is empty.
-- The value shape follows the kind: a string for text, long_text, url and
-- date, a number for number, a boolean for checkbox, the option's value for
-- select, and an array of option values for multi_select.

create table if not exists project_field_values (
  project_id uuid not null references projects(id) on delete cascade,
  field_id uuid not null references project_fields(id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (project_id, field_id)
);

-- The primary key covers "every value for this project", which is the read
-- the project page makes. This one covers the reverse, which is what
-- deleting a field and any future filter-by-field will want.
create index if not exists idx_project_field_values_field
  on project_field_values (field_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table project_fields enable row level security;
alter table project_field_values enable row level security;

-- A definition is workspace metadata, brand-blind, and every member needs to
-- read it to render a project. Writing one shapes how the whole studio
-- records work, so it sits with the people who manage templates: executives
-- and domain managers, which is what app_is_manager already means.
drop policy if exists project_fields_select on project_fields;
create policy project_fields_select on project_fields for select to authenticated
  using (app_is_member(workspace_id));

drop policy if exists project_fields_insert on project_fields;
create policy project_fields_insert on project_fields for insert to authenticated
  with check (app_is_manager(workspace_id));

drop policy if exists project_fields_update on project_fields;
create policy project_fields_update on project_fields for update to authenticated
  using (app_is_manager(workspace_id))
  with check (app_is_manager(workspace_id));

drop policy if exists project_fields_delete on project_fields;
create policy project_fields_delete on project_fields for delete to authenticated
  using (app_is_manager(workspace_id));

-- Values inherit the project, exactly. The EXISTS is inline, not wrapped in a
-- definer helper, so projects_select runs and a value is readable only when
-- its project is. Read the header comment before changing this line.
drop policy if exists project_field_values_select on project_field_values;
create policy project_field_values_select on project_field_values for select to authenticated
  using (exists (select 1 from projects p where p.id = project_field_values.project_id));

-- Writing a value is editing the project, so it takes the same rule
-- projects_update takes: a manager on any project, or the owner on theirs.
-- The EXISTS is again inline, so a project the caller cannot see cannot be
-- written to either.
drop policy if exists project_field_values_insert on project_field_values;
create policy project_field_values_insert on project_field_values for insert to authenticated
  with check (exists (
    select 1 from projects p
    where p.id = project_field_values.project_id
      and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
  ));

drop policy if exists project_field_values_update on project_field_values;
create policy project_field_values_update on project_field_values for update to authenticated
  using (exists (
    select 1 from projects p
    where p.id = project_field_values.project_id
      and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
  ))
  with check (exists (
    select 1 from projects p
    where p.id = project_field_values.project_id
      and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
  ));

drop policy if exists project_field_values_delete on project_field_values;
create policy project_field_values_delete on project_field_values for delete to authenticated
  using (exists (
    select 1 from projects p
    where p.id = project_field_values.project_id
      and (app_is_manager(p.workspace_id) or p.owner_id = auth.uid())
  ));
