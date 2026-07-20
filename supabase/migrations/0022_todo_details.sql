-- My Zone: richer personal to-dos. Custom stages (kanban columns), labels,
-- checklist sub-items, plus notes and priority. Everything is owner-only and
-- carries no wall exposure: this is one person's private list.

create table todo_stages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#8A94A3',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_todo_stages_owner on todo_stages (profile_id, workspace_id, sort_order);

create table todo_labels (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#3B6FF6',
  created_at timestamptz not null default now()
);
create index idx_todo_labels_owner on todo_labels (profile_id, workspace_id);

alter table personal_todos add column stage_id uuid references todo_stages(id) on delete set null;
alter table personal_todos add column priority int not null default 0;
alter table personal_todos add column notes text;
create index idx_personal_todos_stage on personal_todos (stage_id);

-- Denormalized profile_id on the child tables keeps RLS a simple owner check.
create table todo_label_links (
  todo_id uuid not null references personal_todos(id) on delete cascade,
  label_id uuid not null references todo_labels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (todo_id, label_id)
);
create index idx_todo_label_links_label on todo_label_links (label_id);

create table todo_checklist_items (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references personal_todos(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_todo_checklist_todo on todo_checklist_items (todo_id, sort_order);

alter table todo_stages          enable row level security;
alter table todo_labels          enable row level security;
alter table todo_label_links     enable row level security;
alter table todo_checklist_items enable row level security;

create policy todo_stages_all on todo_stages for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and app_is_member(workspace_id));
create policy todo_labels_all on todo_labels for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and app_is_member(workspace_id));
create policy todo_label_links_all on todo_label_links for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy todo_checklist_all on todo_checklist_items for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
