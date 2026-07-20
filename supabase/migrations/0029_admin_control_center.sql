-- Admin Control Center. Workspace-level settings and feature toggles, plus the
-- two ownership columns the admin panel needs and the schema did not have.
--
-- The principle: a setting lives once, at the workspace level, and every screen
-- reads it from here. Nothing is ever copied into a member's account, so an
-- admin change is instantly true for everyone on their next read. Law #1.
--
-- Additive only. No column is dropped or altered, no row is deleted.
--
-- Branding note: workspaces.accent_color stays where it is and remains the one
-- home for that fact. Only logo_url is new here. Two columns for one fact would
-- be exactly the drift this table exists to prevent.

-- ---- workspace settings: one row per workspace ----
-- workspace_id is the primary key, so "one row per workspace" is structural
-- rather than a constraint that could be worked around.
create table workspace_settings (
  workspace_id   uuid primary key references workspaces(id) on delete cascade,
  display_name   text,
  timezone       text not null default 'Asia/Dhaka',
  week_start_day smallint not null default 0 check (week_start_day between 0 and 6),
  locale         text not null default 'en-US',
  logo_url       text,
  -- Catch-all for smaller flags, so a future setting is a write, not a migration.
  settings       jsonb not null default '{}'::jsonb,
  updated_by     uuid references profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- ---- workspace features: one row per (workspace, feature) ----
create table workspace_features (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  feature_key   text not null,
  enabled       boolean not null default true,
  -- Optional floor on the archetype ladder, read by isFeatureEnabled().
  -- Ladder: executive 4 > domain_manager 3 > team_lead 2 > contributor 1,
  -- revenue 1 (alongside contributor).
  min_archetype text check (
    min_archetype in ('executive','domain_manager','team_lead','contributor','revenue')
  ),
  updated_by    uuid references profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (workspace_id, feature_key)
);
create index idx_workspace_features_ws on workspace_features (workspace_id);

-- ---- ownership columns the admin panel reassigns ----
-- clients.owner_id and projects.owner_id already exist and are reused as is.
-- Spaces and lists had no owner at all, so add one to each. Nullable, on delete
-- set null, so removing a person never removes the space or the list.
alter table departments   add column lead_id  uuid references profiles(id) on delete set null;
alter table project_lists add column owner_id uuid references profiles(id) on delete set null;
create index idx_departments_lead    on departments (lead_id);
create index idx_project_lists_owner on project_lists (owner_id);

-- ---- RLS, from the moment the tables exist ----
-- Read: any member of the workspace. Everyone needs the applied settings, and
-- settings are not client identity, so this is the one relaxation.
-- Write: the executive archetype only.
--
-- Neither policy re-queries its own table for the row's own id: both pass the
-- row's own workspace_id into helpers that read memberships. So
-- INSERT ... RETURNING works (the 0021 / 0027 / 0028 lesson).
alter table workspace_settings enable row level security;
alter table workspace_features enable row level security;

create policy workspace_settings_select on workspace_settings for select to authenticated
  using (app_is_member(workspace_id));
create policy workspace_settings_insert on workspace_settings for insert to authenticated
  with check (app_archetype(workspace_id) = 'executive');
create policy workspace_settings_update on workspace_settings for update to authenticated
  using (app_archetype(workspace_id) = 'executive')
  with check (app_archetype(workspace_id) = 'executive');

create policy workspace_features_select on workspace_features for select to authenticated
  using (app_is_member(workspace_id));
create policy workspace_features_insert on workspace_features for insert to authenticated
  with check (app_archetype(workspace_id) = 'executive');
create policy workspace_features_update on workspace_features for update to authenticated
  using (app_archetype(workspace_id) = 'executive')
  with check (app_archetype(workspace_id) = 'executive');

-- No delete policy on either table. A settings row is permanent, and a feature
-- is turned off, never removed.

-- ---- seed, so nothing ever reads null ----
insert into workspace_settings (workspace_id, display_name)
select w.id, w.name from workspaces w
on conflict (workspace_id) do nothing;

-- The toggleable surface. home, tasks, and admin are deliberately absent: they
-- are structural, and an admin who could switch off admin would lock themselves
-- out with no way back in. The read helper hard-ignores those three keys even
-- if a row for one is inserted later.
insert into workspace_features (workspace_id, feature_key, enabled)
select w.id, k.key, true
from workspaces w
cross join (values
  ('clients'), ('projects'), ('database'), ('departments'),
  ('team'), ('hr'), ('performance'), ('calendar'), ('todos')
) as k(key)
on conflict (workspace_id, feature_key) do nothing;
