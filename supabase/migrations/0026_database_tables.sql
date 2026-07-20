-- Database: an Airtable-style store for tech stack details, reference data,
-- and anything else the studio tracks in a grid. Tables define their own
-- fields; row values live in jsonb keyed by field id, so adding a column never
-- touches the schema.
--
-- Two scopes. A manager or executive creates company tables by default, seen
-- by the whole workspace. Everyone else creates personal tables, private until
-- they share them or promote one into the company database (which marks it as
-- contributed by that person).
--
-- Note on the wall: rows are free-form text, not client records, so nothing
-- here is masked by v_clients. Sharing is the access control; the share dialog
-- warns against pasting client identity into a table shared below the wall.

create type db_scope as enum ('personal', 'company');

create table db_tables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#3B6FF6',
  scope db_scope not null default 'personal',
  contributed boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_db_tables_ws on db_tables (workspace_id, scope);
create index idx_db_tables_owner on db_tables (owner_id);

create table db_fields (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references db_tables(id) on delete cascade,
  name text not null,
  -- text | long_text | number | date | checkbox | select | url | person
  type text not null default 'text',
  options jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_db_fields_table on db_fields (table_id, sort_order);

create table db_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references db_tables(id) on delete cascade,
  values jsonb not null default '{}',
  sort_order int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_db_rows_table on db_rows (table_id, sort_order);

create table db_shares (
  table_id uuid not null references db_tables(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  can_edit boolean not null default false,
  primary key (table_id, profile_id)
);
create index idx_db_shares_profile on db_shares (profile_id);

-- ---- visibility helpers ----

create or replace function app_can_see_table(tid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from db_tables t
    where t.id = tid and (
      t.owner_id = auth.uid()
      or (t.scope = 'company' and app_is_member(t.workspace_id))
      or exists (select 1 from db_shares s where s.table_id = t.id and s.profile_id = auth.uid())
    )
  );
$$;

create or replace function app_can_edit_table(tid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from db_tables t
    where t.id = tid and (
      t.owner_id = auth.uid()
      or exists (
        select 1 from db_shares s
        where s.table_id = t.id and s.profile_id = auth.uid() and s.can_edit
      )
      or (t.scope = 'company' and app_archetype(t.workspace_id) in ('executive','domain_manager'))
    )
  );
$$;

-- ---- RLS ----

alter table db_tables enable row level security;
alter table db_fields enable row level security;
alter table db_rows   enable row level security;
alter table db_shares enable row level security;

create policy db_tables_select on db_tables for select to authenticated
  using (app_can_see_table(id));
create policy db_tables_insert on db_tables for insert to authenticated
  with check (owner_id = auth.uid() and app_is_member(workspace_id));
create policy db_tables_update on db_tables for update to authenticated
  using (app_can_edit_table(id)) with check (app_can_edit_table(id));
-- Only the owner, or an executive, retires a table.
create policy db_tables_delete on db_tables for delete to authenticated
  using (owner_id = auth.uid() or app_archetype(workspace_id) = 'executive');

create policy db_fields_select on db_fields for select to authenticated
  using (app_can_see_table(table_id));
create policy db_fields_write on db_fields for insert to authenticated
  with check (app_can_edit_table(table_id));
create policy db_fields_update on db_fields for update to authenticated
  using (app_can_edit_table(table_id)) with check (app_can_edit_table(table_id));
create policy db_fields_delete on db_fields for delete to authenticated
  using (app_can_edit_table(table_id));

create policy db_rows_select on db_rows for select to authenticated
  using (app_can_see_table(table_id));
create policy db_rows_write on db_rows for insert to authenticated
  with check (app_can_edit_table(table_id));
create policy db_rows_update on db_rows for update to authenticated
  using (app_can_edit_table(table_id)) with check (app_can_edit_table(table_id));
create policy db_rows_delete on db_rows for delete to authenticated
  using (app_can_edit_table(table_id));

-- Shares are managed by whoever can edit the table; everyone who can see the
-- table can see who it is shared with.
create policy db_shares_select on db_shares for select to authenticated
  using (app_can_see_table(table_id));
create policy db_shares_write on db_shares for insert to authenticated
  with check (app_can_edit_table(table_id));
create policy db_shares_update on db_shares for update to authenticated
  using (app_can_edit_table(table_id)) with check (app_can_edit_table(table_id));
create policy db_shares_delete on db_shares for delete to authenticated
  using (app_can_edit_table(table_id));
