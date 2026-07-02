-- Feature tables for Phases 3 through 7: templates, deliverables, task
-- collaboration, leave, notifications, events, announcements, counters.

create table project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  project_type text,
  structure jsonb not null default '{"phases": []}',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table task_revisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  type leave_type not null default 'annual',
  start_date date not null,
  end_date date not null,
  days numeric not null,
  reason text,
  status leave_status not null default 'pending',
  lead_approved_by uuid references profiles(id),
  lead_approved_at timestamptz,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (days > 0)
);

create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  year int not null,
  total_days numeric not null default 20,
  used_days numeric not null default 0,
  unique (workspace_id, profile_id, year)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  type text not null default 'other',
  start_date date not null,
  end_date date,
  all_day boolean not null default true,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  body text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Per-workspace, per-kind counters behind generated codes like PRJ-1042.
create table workspace_counters (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,
  value int not null default 1000,
  primary key (workspace_id, kind)
);

create index idx_templates_workspace on project_templates (workspace_id);
create index idx_deliverables_project on deliverables (project_id);
create index idx_comments_task on task_comments (task_id);
create index idx_revisions_task on task_revisions (task_id);
create index idx_leave_requests_ws_profile on leave_requests (workspace_id, profile_id);
create index idx_leave_balances_ws_profile on leave_balances (workspace_id, profile_id);
create index idx_notifications_recipient on notifications (profile_id, is_read, created_at desc);
create index idx_events_workspace_date on events (workspace_id, start_date);
create index idx_announcements_workspace on announcements (workspace_id, created_at desc);
