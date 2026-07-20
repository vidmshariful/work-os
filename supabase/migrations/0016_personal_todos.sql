-- My Zone: a private personal checklist, one owner per row. Not tied to any
-- project or client, so it carries no wall exposure. Only the owner can read
-- or write their own to-dos.

create table personal_todos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_personal_todos_owner on personal_todos (profile_id, workspace_id, is_done);

alter table personal_todos enable row level security;

create policy personal_todos_select on personal_todos for select to authenticated
  using (profile_id = auth.uid());
create policy personal_todos_insert on personal_todos for insert to authenticated
  with check (profile_id = auth.uid() and app_is_member(workspace_id));
create policy personal_todos_update on personal_todos for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy personal_todos_delete on personal_todos for delete to authenticated
  using (profile_id = auth.uid());
