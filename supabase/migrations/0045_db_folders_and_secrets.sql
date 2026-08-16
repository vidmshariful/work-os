-- Folders for the Database section, folder level access, and an audit trail
-- for revealed secrets.
--
-- WHY. The Database is about to hold the studio's real records: tool logins,
-- inventory, vendor details. Two things were missing for that. There was no
-- way to group tables and docs and hand the whole group to a person, only a
-- per item share. And a password lived in the row JSON in plain text, so
-- every member of the workspace could read it, which is how the Tools List
-- sits today.
--
-- WHAT CHANGES IN EXISTING RLS, asked for and approved. app_can_see_table
-- and app_can_edit_table gain one more branch: a grant on the folder the
-- table sits in. db_tables_select, docs_select and docs_update gain the same
-- branch. The wording of every existing branch is unchanged, so nothing that
-- could see a table before can stop seeing it now. Departments, projects,
-- app_can_see_department and projects_select are not touched.
--
-- Secrets are encrypted by the application before they ever reach Postgres,
-- with a key that is not in this database. Nothing here can read them, which
-- is the point: a dump of this database, or the service role key on its own,
-- is not enough.

-- ---- folders --------------------------------------------------------------

create table if not exists db_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#3B6FF6',
  -- Same two scopes a table has, and the same meaning. A company folder is
  -- the shared filing cabinet, a personal one is yours until you grant it.
  scope db_scope not null default 'personal',
  created_at timestamptz not null default now()
);

create table if not exists db_folder_shares (
  folder_id uuid not null references db_folders(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (folder_id, profile_id)
);

alter table db_tables add column if not exists folder_id uuid references db_folders(id) on delete set null;
alter table docs add column if not exists folder_id uuid references db_folders(id) on delete set null;

create index if not exists db_folders_ws_idx on db_folders(workspace_id);
create index if not exists db_folder_shares_profile_idx on db_folder_shares(profile_id);
create index if not exists db_tables_folder_idx on db_tables(folder_id);
create index if not exists docs_folder_idx on docs(folder_id);

-- ---- who can see a folder --------------------------------------------------

-- Security definer so the check can read db_folders and db_folder_shares
-- without those tables' own policies recursing back into this function.
create or replace function app_can_see_folder(fid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select fid is not null and exists (
    select 1 from db_folders f
    where f.id = fid and (
      f.owner_id = auth.uid()
      or (f.scope = 'company' and app_is_member(f.workspace_id))
      or exists (
        select 1 from db_folder_shares s
        where s.folder_id = f.id and s.profile_id = auth.uid()
      )
    )
  );
$$;

create or replace function app_can_edit_folder(fid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select fid is not null and exists (
    select 1 from db_folders f
    where f.id = fid and (
      f.owner_id = auth.uid()
      or exists (
        select 1 from db_folder_shares s
        where s.folder_id = f.id and s.profile_id = auth.uid() and s.can_edit
      )
      or (f.scope = 'company' and app_archetype(f.workspace_id) in ('executive','domain_manager'))
    )
  );
$$;

alter table db_folders enable row level security;
alter table db_folder_shares enable row level security;

-- Spelled out rather than routed through app_can_see_folder, and this is not
-- style. Those helpers are stable, so inside an insert returning they read
-- the snapshot from before the statement and cannot see the row being
-- inserted: creating a folder would fail its own select policy. Naming the
-- row's columns directly avoids the self query entirely, which is why
-- db_tables_select was already written this way.
drop policy if exists db_folders_select on db_folders;
create policy db_folders_select on db_folders for select
  using (
    owner_id = auth.uid()
    or (scope = 'company' and app_is_member(workspace_id))
    or exists (
      select 1 from db_folder_shares s
      where s.folder_id = db_folders.id and s.profile_id = auth.uid()
    )
  );

drop policy if exists db_folders_insert on db_folders;
create policy db_folders_insert on db_folders for insert
  with check (owner_id = auth.uid() and app_is_member(workspace_id));

drop policy if exists db_folders_update on db_folders;
create policy db_folders_update on db_folders for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from db_folder_shares s
      where s.folder_id = db_folders.id and s.profile_id = auth.uid() and s.can_edit
    )
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from db_folder_shares s
      where s.folder_id = db_folders.id and s.profile_id = auth.uid() and s.can_edit
    )
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  );

-- Deleting a folder is the owner's call, or an executive's. Contents are not
-- deleted with it: the foreign keys above set folder_id back to null, so the
-- tables and docs return to the top level rather than disappearing.
drop policy if exists db_folders_delete on db_folders;
create policy db_folders_delete on db_folders for delete
  using (owner_id = auth.uid() or app_archetype(workspace_id) = 'executive');

-- A grant is visible to the person who holds it and to anyone who can edit
-- the folder, so the people list on the folder page is readable by the people
-- who are allowed to change it.
drop policy if exists db_folder_shares_select on db_folder_shares;
create policy db_folder_shares_select on db_folder_shares for select
  using (profile_id = auth.uid() or app_can_edit_folder(folder_id));

drop policy if exists db_folder_shares_write on db_folder_shares;
create policy db_folder_shares_write on db_folder_shares for insert
  with check (app_can_edit_folder(folder_id));

drop policy if exists db_folder_shares_update on db_folder_shares;
create policy db_folder_shares_update on db_folder_shares for update
  using (app_can_edit_folder(folder_id)) with check (app_can_edit_folder(folder_id));

drop policy if exists db_folder_shares_delete on db_folder_shares;
create policy db_folder_shares_delete on db_folder_shares for delete
  using (app_can_edit_folder(folder_id));

-- ---- folders reach the things inside them ----------------------------------

-- One new branch each. Every other branch is the 0000 wording, character for
-- character, so this can only widen access to a folder's contents for people
-- who were granted that folder.
create or replace function app_can_see_table(tid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from db_tables t
    where t.id = tid and (
      t.owner_id = auth.uid()
      or (t.scope = 'company' and app_is_member(t.workspace_id))
      or exists (select 1 from db_shares s where s.table_id = t.id and s.profile_id = auth.uid())
      or app_can_see_folder(t.folder_id)
    )
  );
$$;

create or replace function app_can_edit_table(tid uuid)
returns boolean language sql stable security definer
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
      or app_can_edit_folder(t.folder_id)
    )
  );
$$;

drop policy if exists db_tables_select on db_tables;
create policy db_tables_select on db_tables for select
  using (
    owner_id = auth.uid()
    or (scope = 'company' and app_is_member(workspace_id))
    or exists (select 1 from db_shares s where s.table_id = db_tables.id and s.profile_id = auth.uid())
    or app_can_see_folder(folder_id)
  );

drop policy if exists db_tables_update on db_tables;
create policy db_tables_update on db_tables for update
  using (
    owner_id = auth.uid()
    or exists (select 1 from db_shares s where s.table_id = db_tables.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
    or app_can_edit_folder(folder_id)
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from db_shares s where s.table_id = db_tables.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
    or app_can_edit_folder(folder_id)
  );

drop policy if exists docs_select on docs;
create policy docs_select on docs for select
  using (
    owner_id = auth.uid()
    or (scope = 'company' and app_is_member(workspace_id))
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid())
    or app_can_see_folder(folder_id)
  );

drop policy if exists docs_update on docs;
create policy docs_update on docs for update
  using (
    owner_id = auth.uid()
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
    or app_can_edit_folder(folder_id)
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
    or app_can_edit_folder(folder_id)
  );

-- ---- the audit trail for secrets -------------------------------------------

-- Every time somebody reveals or copies a stored credential, a row lands
-- here. Deliberately not activity_log: that feed is read by everyone in the
-- workspace, and who looked at which password is not everyone's business.
create table if not exists secret_reveals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  table_id uuid not null references db_tables(id) on delete cascade,
  row_id uuid not null references db_rows(id) on delete cascade,
  field_id uuid not null references db_fields(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  action text not null default 'reveal',
  created_at timestamptz not null default now()
);

create index if not exists secret_reveals_table_idx on secret_reveals(table_id, created_at desc);

alter table secret_reveals enable row level security;

-- You can always see your own history. Beyond that it is for the people who
-- own the data: whoever can edit the table, which is the owner, an explicit
-- editor, a folder editor, or a manager over a company table.
drop policy if exists secret_reveals_select on secret_reveals;
create policy secret_reveals_select on secret_reveals for select
  using (actor_id = auth.uid() or app_can_edit_table(table_id));

-- Written only for yourself, and only for a table you are allowed to read.
-- Nobody can forge a line saying someone else looked.
drop policy if exists secret_reveals_insert on secret_reveals;
create policy secret_reveals_insert on secret_reveals for insert
  with check (actor_id = auth.uid() and app_can_see_table(table_id));

-- No update and no delete policy, so the trail cannot be edited or erased
-- from the application under anybody's login.
