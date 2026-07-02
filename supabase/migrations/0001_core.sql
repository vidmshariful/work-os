-- Work OS core schema. Enums and the five core tables.

create type role_type as enum (
  'ceo','cfo','ops_manager','creative_lead','marketing_manager',
  'design_lead','animation_lead','editing_lead',
  'designer','animator','editor','marketer','closer','appointment_setter'
);
create type archetype_type as enum ('executive','domain_manager','team_lead','contributor','revenue');
create type wall_side as enum ('above','below');
create type brand_origin as enum ('direct','ghl_video','ghl_animation');   -- sensitive, above wall only
create type client_status as enum ('active','paused','completed','archived');
create type project_status as enum ('backlog','in_progress','review','delivered','archived');
create type task_status as enum ('backlog','todo','in_progress','review','done','blocked');
create type leave_status as enum ('pending','approved','rejected','cancelled');
create type leave_type as enum ('annual','sick','unpaid','other');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  accent_color text not null default '#3B6FF6',
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role role_type not null,
  archetype archetype_type not null,
  reports_to uuid references profiles(id),
  wall_side wall_side not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, workspace_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text not null,
  commercial_name text not null,   -- ABOVE WALL
  contact_name text,               -- ABOVE WALL
  contact_email text,              -- ABOVE WALL
  origin brand_origin not null default 'direct',  -- ABOVE WALL, most sensitive
  contract_value numeric,          -- ABOVE WALL
  status client_status not null default 'active',
  owner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  code text not null,
  title text not null,             -- brand-blind spec title, never a client name
  type text,
  status project_status not null default 'backlog',
  owner_id uuid references profiles(id),
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  phase_id uuid references project_phases(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references profiles(id),
  status task_status not null default 'backlog',
  priority int not null default 0,
  due_date date,
  revision_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_memberships_profile on memberships (profile_id) where is_active;
create index idx_memberships_workspace on memberships (workspace_id) where is_active;
create index idx_clients_workspace on clients (workspace_id);
create index idx_projects_workspace on projects (workspace_id);
create index idx_projects_client on projects (client_id);
create index idx_phases_project on project_phases (project_id);
create index idx_tasks_project on tasks (project_id);
create index idx_tasks_assignee on tasks (assignee_id);
create index idx_tasks_status on tasks (status);
