-- Database, Phase 2: Docs. Three kinds share one record:
--   page  — a wiki page written in the app (markdown source in content)
--   file  — an uploaded file of any format, previewed in the app
--   link  — an external URL such as a Google Doc, opened or previewed inline
-- Scope and sharing mirror db_tables exactly.

create type doc_kind as enum ('page', 'file', 'link');

create table docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  kind doc_kind not null default 'page',
  content text,
  file_path text,
  file_name text,
  file_type text,
  url text,
  color text not null default '#3B6FF6',
  scope db_scope not null default 'personal',
  contributed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_docs_ws on docs (workspace_id, scope);
create index idx_docs_owner on docs (owner_id);

create table doc_shares (
  doc_id uuid not null references docs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  can_edit boolean not null default false,
  primary key (doc_id, profile_id)
);
create index idx_doc_shares_profile on doc_shares (profile_id);

-- Helpers for the child table only. Policies on docs itself reference their
-- own columns, so INSERT/UPDATE ... RETURNING works (the 0021 / 0027 lesson).
create or replace function app_can_see_doc(did uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from docs d
    where d.id = did and (
      d.owner_id = auth.uid()
      or (d.scope = 'company' and app_is_member(d.workspace_id))
      or exists (select 1 from doc_shares s where s.doc_id = d.id and s.profile_id = auth.uid())
    )
  );
$$;

create or replace function app_can_edit_doc(did uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from docs d
    where d.id = did and (
      d.owner_id = auth.uid()
      or exists (
        select 1 from doc_shares s
        where s.doc_id = d.id and s.profile_id = auth.uid() and s.can_edit
      )
      or (d.scope = 'company' and app_archetype(d.workspace_id) in ('executive','domain_manager'))
    )
  );
$$;

alter table docs       enable row level security;
alter table doc_shares enable row level security;

create policy docs_select on docs for select to authenticated
  using (
    owner_id = auth.uid()
    or (scope = 'company' and app_is_member(workspace_id))
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid())
  );
create policy docs_insert on docs for insert to authenticated
  with check (owner_id = auth.uid() and app_is_member(workspace_id));
create policy docs_update on docs for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from doc_shares s where s.doc_id = docs.id and s.profile_id = auth.uid() and s.can_edit)
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  );
create policy docs_delete on docs for delete to authenticated
  using (owner_id = auth.uid() or app_archetype(workspace_id) = 'executive');

create policy doc_shares_select on doc_shares for select to authenticated
  using (app_can_see_doc(doc_id));
create policy doc_shares_write on doc_shares for insert to authenticated
  with check (app_can_edit_doc(doc_id));
create policy doc_shares_update on doc_shares for update to authenticated
  using (app_can_edit_doc(doc_id)) with check (app_can_edit_doc(doc_id));
create policy doc_shares_delete on doc_shares for delete to authenticated
  using (app_can_edit_doc(doc_id));

-- Private bucket for uploaded docs. Reads go through short-lived signed URLs
-- issued server-side, the same way project files work.
insert into storage.buckets (id, name, public)
values ('doc-files', 'doc-files', false)
on conflict (id) do nothing;
