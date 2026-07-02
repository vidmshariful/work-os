# Work OS — Build Plan

**A phase-by-phase build specification for Claude Code.**
Internal operating system for Vidiosa. Version 1. Single workspace, architected so more can follow without a rewrite.

---

## 0. How to read this document

This is the source of truth for the build. Work through the phases in order. Do not start a phase until the previous phase meets its Definition of Done. Each phase lists what to build, the data it touches, and the acceptance test that proves it works.

Two things are non-negotiable and appear throughout: the brand wall (Section 3) and secrets handling (Section 4). If any instruction elsewhere conflicts with those two, those two win.

---

## 1. What we are building

Work OS is the internal system that runs the Vidiosa studio. It replaces the current mix of ClickUp, Retable, Rysenova, and verbal coordination with one connected spine. It captures every client, project, and task, computes performance from the work itself, and enforces a confidentiality boundary (the brand wall) in the database rather than in human discipline.

**The operating model.** Vidiosa is the studio and the employer. Every person is hired under Vidiosa. Certain niche brands are, operationally, white-label clients of Vidiosa. Inside this app there is no special handling for those brands. There is only client work. Every project is a client project, uniform, no exceptions. This uniformity is what makes the wall reliable: a confidential client is protected because it was never singled out.

**The five laws the system obeys.**
1. Single source of truth. Every fact lives in one place and is referenced everywhere. Nobody re-types data that already exists.
2. Role-based views. The same data, filtered to what each role needs. Complexity exists but stays hidden from whoever does not need it.
3. KPI is exhaust, not input. Metrics are computed from work already flowing through the system. No performance data is ever typed by hand.
4. Two altitudes. A personal layer to glance across workspaces, and a workspace layer you enter to do the work.
5. Handoffs fire as events. A closed deal creates the client, scaffolds the project, assigns the owner, and notifies the team automatically.

---

## 2. Tech stack

Do not substitute without reason. This stack is chosen for a solo-driven build on Claude Code.

- **Framework:** Next.js 15, App Router, TypeScript, React Server Components by default.
- **Styling:** Tailwind CSS. Component primitives from shadcn/ui (Radix based).
- **Animation:** Framer Motion. Used with restraint, on transitions and reveals only.
- **Database, auth, storage, realtime:** Supabase (Postgres, Supabase Auth, Row Level Security, Storage, Realtime).
- **Server data access:** Supabase server client inside Server Components and Server Actions. Client-side interactivity uses the Supabase browser client and, where needed, TanStack Query.
- **Deployment:** Vercel.
- **Migrations:** Plain SQL files under `supabase/migrations`, applied with the Supabase CLI. All schema changes are migrations. No manual dashboard edits to schema in anything beyond throwaway testing.

---

## 3. The brand wall (read before writing any schema)

The wall is the reason this system is custom-built. It has two guarantees. Both are enforced in Postgres, not in the UI.

**Guarantee 1: identity is invisible below the wall.** A client's commercial identity (real name, contact, brand origin, contract value) is stripped from every read performed by a below-wall user. Below the wall, a client is a code and nothing more. A project carries a brand-blind title and a project code, never a client name.

**Guarantee 2: existence is invisible.** A below-wall user's world must look like their own workspace is the only one that exists. Workspaces they are not a member of must never appear anywhere: not in a switcher, a directory, a notification, or an autocomplete. In v1 there is a single workspace, so this reduces to: never build a UI surface that lists workspaces the current user is not a member of. Honor it now so it holds when more workspaces exist.

**How Guarantee 1 is implemented.** Every membership carries a `wall_side` of `above` or `below`. The `clients` base table holds all fields but is never read directly by the app. Reads go through a security-definer view, `v_clients`, that filters rows to the user's workspaces and masks the commercial columns to `null` for below-wall users. Direct table access is revoked from the application roles. Writes to clients go through a role-checked server action or RPC. See Phase 1 for the exact SQL.

The most sensitive field is `origin` (which niche brand a client belongs to). It is masked exactly like the other commercial columns. Below the wall it does not exist.

---

## 4. Secrets and environment

**Security rule, absolute.** No secret is ever hard-coded, committed, logged, or sent to the browser. The service role key and the database password are server-only and grant full control of the database. If they ever touch client code or a repo, the system is compromised.

Create `.env.local` (git-ignored). Populate the values from the Supabase dashboard. Never print them.

```
NEXT_PUBLIC_SUPABASE_URL=          # safe in the browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # safe in the browser, protected by RLS
SUPABASE_SERVICE_ROLE_KEY=         # SERVER ONLY. never NEXT_PUBLIC. never client code.
SUPABASE_DB_PASSWORD=              # migrations and psql only. not used by the app.
```

Confirm `.gitignore` contains `.env*` (except `.env.example`). Ship a committed `.env.example` with the keys above and empty values. The service role key is used only inside server-side code paths that legitimately need to bypass RLS (seeding, admin actions, system-generated notifications). Everything else uses the anon key under RLS.

---

## 5. Roles, archetypes, and the wall line

Fourteen roles collapse into five permission archetypes plus department scoping. The reporting line drives both permission scope and KPI rollups.

| Role | Archetype | Wall side |
|---|---|---|
| CEO | executive | above |
| CFO | executive | above |
| Operations Manager | executive | above |
| Creative Lead | domain_manager | above |
| Marketing Manager | domain_manager | above |
| Design Lead | team_lead | below |
| Animation Lead | team_lead | below |
| Video Editing Lead | team_lead | below |
| Designer / Animator / Editor | contributor | below |
| Marketing team | contributor | below |
| Sales Closer | revenue | above |
| Appointment Setter | revenue | below |

Wall side is set per membership and is the field the wall engine reads. The table above is the default. Any single row can be changed in data with no code change.

---

## 6. File structure

```
app/
  (auth)/login/
  (personal)/                 # the personal layer, above workspaces
    dashboard/                # cross-workspace glance
    notifications/            # aggregated, workspace-tagged
    account/
  (workspace)/[ws]/           # workspace layer, everything below lives here
    layout.tsx                # top bar + role-aware sidebar
    home/
    clients/
    projects/
    tasks/
    team/
    hr/
    performance/
    calendar/
    admin/
lib/
  supabase/client.ts          # browser client (anon)
  supabase/server.ts          # server client (anon, cookie-bound)
  supabase/admin.ts           # service-role client, server only
  supabase/middleware.ts      # session refresh
  rbac.ts                     # archetype -> allowed nav + capabilities
  wall.ts                     # helpers for reading masked data
components/
supabase/
  migrations/                 # ordered .sql files
  seed.sql
```

---

## 7. Design system and UI direction

The look is a clean, light, modern SaaS dashboard: airy, soft, confident, data-first. This is the internal-tool aesthetic and is deliberately different from the dark public brand sites. Build the tokens and components below first, then compose every screen from them. Consistency is the point. A person learns the interface once and recognizes it everywhere.

### 7.1 The shared DNA to build toward

Pulled from the reference set, these patterns define the system:
- A grouped left sidebar with small uppercase section labels and a soft-fill active state.
- A slim icon rail to the left of the sidebar for switching workspaces, one icon per workspace, showing only workspaces the user is a member of.
- White cards on a light gray canvas, hairline borders, very soft shadows, generous whitespace.
- Pill tags that pair a soft pastel background with a saturated colored dot, used for status, department, and people.
- Near-black primary buttons. Secondary actions are outlined or ghost.
- Stat-card rows and progress rings for anything quantitative.
- Right-rail panels on detail screens for secondary context such as assigned people, activity, and notifications.
- Date-grouped or status-grouped list rows with a title, subtitle, meta columns, a tag, and a trailing action plus overflow.
- Avatar stacks with a plus-N overflow, count badges on nav items, breadcrumbs on inner pages, prominent global search.

### 7.2 Tokens

```
/* Canvas and surface */
--bg: #F6F7F9;            /* app background */
--surface: #FFFFFF;       /* cards, panels */
--surface-2: #FBFBFC;     /* hover and subtle raise */
--border: #E8EAED;        /* hairlines */
--border-strong: #D9DCE1;

/* Text */
--text: #1A1D21;
--text-2: #6B7280;
--text-3: #9AA1AC;

/* Actions */
--primary: #14171B;       /* near-black primary buttons */
--primary-hover: #000000;
--accent: #3B6FF6;        /* focus rings, selection, active tab, links, progress */
--accent-soft: #EAF0FE;

/* Wall signal: above-wall confidential marker ONLY */
--wall: #C77A15;
--wall-soft: #FBF0DE;

/* Semantic */
--success: #16A34A; --success-soft: #E7F6EC;
--warning: #C77A15; --warning-soft: #FBF0DE;
--danger:  #DC2626; --danger-soft:  #FCE9E9;

/* Neutral fills */
--nav-active: #F0F1F3;
--chip-gray: #F0F1F3;

/* Type */
--font-ui:   "Inter", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;  /* codes, times, tabular data */

/* Radius */
--r-card: 14px; --r-control: 9px; --r-chip: 8px; --r-pill: 999px;

/* Shadow */
--shadow-sm: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
--shadow-md: 0 4px 12px rgba(16,24,40,.08);
```

Type scale, all Inter unless noted: page title 26 / 600, section heading 18 / 600, card title 15 / 600, body 14 / 400, meta 12.5 / 500, group label 11 / 600 uppercase with 0.08em tracking. Codes, times, and any numeric column use IBM Plex Mono with `font-variant-numeric: tabular-nums`. Spacing is a 4px grid, card padding 20 to 24, page gutter 24 to 32. Icons are Lucide, 1.5 stroke, 18 to 20px.

Tag palette, each as soft background plus dot: blue `#EAF0FE / #3B6FF6`, violet `#F0ECFD / #7C5CFC`, green `#E7F6EC / #16A34A`, amber `#FBF0DE / #C77A15`, rose `#FDECEF / #E5486D`, teal `#E5F6F5 / #12A8A0`, gray `#F0F1F3 / #8A94A3`. Status mapping: Backlog gray, Todo blue, In progress blue, Review amber, Done green, Blocked rose. Each workspace also carries one accent color shown in the icon rail.

### 7.3 Layout shell

- **Icon rail**, far left, narrow. One icon per workspace the user belongs to, tinted with that workspace's accent, plus the current one highlighted. This is Guarantee 2 in the interface: only member workspaces appear, and there is no locked or greyed entry hinting at others.
- **Sidebar**, next to the rail. Grouped nav with uppercase micro labels in the order Work, People, Insight, Admin. Active item is a soft neutral fill with dark text. Count badges on items like My Tasks. The user profile, Settings, and Help pin to the bottom. Admin appears only for executives.
- **Top bar.** Global search on the left as a rounded field, a New button for quick create, a notifications bell with an unread dot, and a profile chip. Inner pages show breadcrumbs under the bar, and screen-specific actions such as Filter and Export sit on the right.
- **Content.** Light canvas, white cards, comfortable max width. Detail screens may use a right rail for secondary context.

### 7.4 Components to build as primitives

Build these once, reuse everywhere. Each lists its main use.
- **NavItem** (default, active, with-badge) and **GroupLabel**. The sidebar.
- **WorkspaceRailItem.** The switcher rail.
- **Card** with an optional title row and overflow menu. The base container.
- **StatCard**: icon chip, big number, label. Dashboard and KPI headers.
- **ListRow**: title plus subtitle, meta columns, a tag, a trailing primary action and overflow. Projects, tasks, history.
- **Tag** and **StatusChip**: soft background plus colored dot. Department, status, people.
- **Avatar** and **AvatarStack** with plus-N. Assigned people.
- **Button** variants: primary near-black, secondary outline, ghost, destructive.
- **Field** and **SearchField**. Forms and the top bar.
- **ProgressRing** and **ProgressBar**. Project completion and KPI.
- **DataTable** with row hover and tabular numerals. KPI and history tables.
- **RightRailPanel.** Notifications, assigned people, activity.
- **Breadcrumbs**, **CountBadge**, **DragHandle** (six-dot, for reorderable tasks and templates), **Toast**.
- **EmptyState**: a quiet icon, one line of direction, and a primary action. An empty screen is an invitation to act, never a dead end.

### 7.5 The brand wall, in the interface

This is the most important design rule and it is subtle. Below the wall, masking must look like the normal state of the world, not like something is hidden.

- Below the wall, a client or project is identified by its code in mono, for example `PRJ-1042`. There is simply no name field on the screen. Do not render a blanked box, a lock icon, or a "redacted" label to below-wall users. Any of those reveals that something exists to be hidden, which defeats the purpose. To the animator, clients are codes, and that is all clients have ever been.
- The amber wall color is used only on above-wall screens. When an above-wall user views a client whose origin is a niche brand, show a small amber "Confidential" chip. This is an operator safety cue for the people who are allowed to see the identity, reminding them not to leak it. Below-wall users never encounter amber in this context because they never see the record's identity at all.
- The workspace rail shows no trace of workspaces the user cannot enter.

The result: below the wall the app looks clean and ordinary, with codes as the natural language of work. Above the wall, full identity is visible with a discreet confidential marker where it matters.

### 7.6 Per-screen layout notes

- **Home.** A stat-card row across the top, a My Work list below, a right rail for announcements and recent notifications.
- **Projects.** A list view of ListRows and a board view of status columns. A row shows the project code, brand-blind title, owner tag, status chip, a completion ring, and Open plus overflow.
- **Project detail.** Main column for phases, deliverables, and the task list. Right rail for the assigned-people avatar stack, timeline, and files.
- **My Work and Tasks.** Grouped list, by status or by day. Each task shows its project code, title, status chip, due date, and revision count.
- **Task detail.** Description or prompt card, a meta row for status, revisions, and dependencies, and a comments thread.
- **Clients.** A list of code, status, and owner. Above the wall, add the commercial name and the Confidential chip on niche-brand clients.
- **Team.** Directory and org chart driven by reporting lines, with avatar stacks and role tags.
- **Performance.** Stat cards and progress rings up top, KPI tables below with tabular numerals.
- **Calendar.** Month and week grids with events color-coded by type, fed automatically from deadlines and approved leave.
- **Notifications.** The right-rail feed pattern in the top bar, and a full personal hub aggregated across workspaces and tagged by workspace.

### 7.7 Quality floor

Responsive to mobile, where the sidebar collapses to the icon rail or a drawer. Visible keyboard focus using the accent ring. Reduced motion respected. Framer Motion used only for page and section transitions and light hover states, never scattered everywhere, since over-animation reads as generic. Interface copy is sentence case with plain verbs, names things by what the user controls, and uses no em-dashes. Use periods, commas, or colons.

---

## PHASE 0 — Project setup

**Goal.** A running Next.js app connected to Supabase, with auth working and the design system in place. No business features yet.

**Build.**
- Initialize Next.js 15 (App Router, TypeScript), Tailwind, shadcn/ui.
- Install and configure the Supabase CLI. Link to the project. Confirm `supabase/migrations` is the schema pipeline.
- Create the three Supabase clients: browser (`client.ts`), server (`server.ts`, cookie-bound), and admin (`admin.ts`, service role, server only). Add the session-refresh middleware.
- Build Supabase Auth: a `/login` route (email and password to start), a protected app layout that redirects unauthenticated users to login, and sign-out.
- Establish the design system per Section 7. Light canvas, white cards, near-black primary buttons, Inter for the interface, IBM Plex Mono for codes and numeric data, soft rounded cards, a grouped sidebar with pill active states. Amber is reserved exclusively for the confidential marker on above-wall screens and is never decorative. Build the core components in Section 7 as reusable primitives before any feature screen exists.

**Definition of Done.** A user can be created in Supabase Auth, log in at `/login`, land on a protected empty shell, and sign out. Secrets are only in `.env.local`. `.env.example` is committed.

---

## PHASE 1 — Data model and the brand wall

**Goal.** The full schema, row level security, and the client-masking view. This is the foundation. The wall must pass its acceptance test before any UI reads client data.

**Build.** Apply the following as ordered migrations.

**6.1 Enums and core tables.**

```sql
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

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
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
```

**6.2 Helper functions.** Security definer so they read memberships without RLS recursion.

```sql
create or replace function app_is_member(ws uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws and m.is_active);
$$;

create or replace function app_is_above_wall(ws uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws
      and m.wall_side = 'above' and m.is_active);
$$;

create or replace function app_archetype(ws uuid)
returns archetype_type language sql security definer stable as $$
  select m.archetype from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws and m.is_active limit 1;
$$;
```

**6.3 The wall view.** The only door to client data. Filters rows by membership, masks commercial columns below the wall. Then revoke direct access to the base table.

```sql
create view v_clients with (security_invoker = false) as
select
  c.id, c.workspace_id, c.code, c.status, c.owner_id, c.created_at,
  case when app_is_above_wall(c.workspace_id) then c.commercial_name end as commercial_name,
  case when app_is_above_wall(c.workspace_id) then c.contact_name    end as contact_name,
  case when app_is_above_wall(c.workspace_id) then c.contact_email   end as contact_email,
  case when app_is_above_wall(c.workspace_id) then c.origin::text     end as origin,
  case when app_is_above_wall(c.workspace_id) then c.contract_value  end as contract_value
from clients c
where app_is_member(c.workspace_id);

revoke all on clients from anon, authenticated;
grant select on v_clients to authenticated;
```

The app reads clients only through `v_clients`. Client writes happen in a server action that first checks the caller is above the wall or revenue archetype, then inserts using the admin client.

**6.4 RLS.** Enable on every table. Core policies below. Follow the same pattern for remaining tables (Section 7 tables get theirs in their phases).

```sql
alter table profiles     enable row level security;
alter table workspaces   enable row level security;
alter table memberships  enable row level security;
alter table clients      enable row level security;
alter table projects     enable row level security;
alter table tasks        enable row level security;

-- profiles: self, or anyone sharing a workspace with me
create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from memberships me join memberships them
      on me.workspace_id = them.workspace_id
    where me.profile_id = auth.uid() and them.profile_id = profiles.id
  )
);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces: only ones I belong to. this is Guarantee 2 in force.
create policy workspaces_select on workspaces for select to authenticated
  using (app_is_member(id));

-- memberships: rows in my workspaces
create policy memberships_select on memberships for select to authenticated
  using (app_is_member(workspace_id));

-- clients base table has no authenticated access at all (see revoke above).
-- projects: any member of the workspace (title is brand-blind)
create policy projects_select on projects for select to authenticated
  using (app_is_member(workspace_id));

-- tasks: members of the project's workspace
create policy tasks_select on tasks for select to authenticated using (
  exists (select 1 from projects p where p.id = tasks.project_id and app_is_member(p.workspace_id))
);
```

Write policies (insert, update, delete) are added per phase, gated by archetype. Default posture: contributors write only their own task status and revisions; leads write within their team; executives and domain managers write broadly. Never open a write policy wider than the phase needs.

**6.5 Seed.** Create four auth users through Supabase Auth, then seed profiles, one workspace, memberships across the wall, and a wall-testing dataset.

- Workspace: `vidiosa`.
- People: an executive above the wall (Operations Manager), a domain manager above (Creative Lead), a contributor below (Animator), reporting to the Creative Lead.
- Clients: one with `origin = 'ghl_video'`, commercial name and contact populated; one with `origin = 'direct'`.
- One project linked to the confidential client, with a brand-blind title. A few tasks assigned to the animator.

**Definition of Done. This is the wall acceptance test.**
- Signed in as the below-wall animator, `select * from v_clients` returns every client's `code` and `status`, and `null` for `commercial_name`, `contact_name`, `contact_email`, `origin`, and `contract_value`.
- Signed in as the above-wall Operations Manager, the same query returns the real commercial values including `origin`.
- A direct `select * from clients` as either user fails, because access is revoked.
- The below-wall user's `select * from workspaces` returns only Vidiosa.

Do not proceed to Phase 3 until every one of these passes.

---

## PHASE 2 — App shell and navigation

**Goal.** The top bar, the role-aware left sidebar, and the split between the personal layer and the workspace layer. No feature screens yet, just the frame and correct visibility.

**Build.**
- **Top bar**, present on every workspace screen: workspace switcher (lists only workspaces from `v` of memberships, which in v1 is Vidiosa), global search field (wired to a stub for now), a quick-create button, a notifications bell (stub count), and a profile menu.
- **Left sidebar**, grouped into Work (Home, Clients, Projects, Tasks), People (Team, HR and Leave), Insight (Performance, Calendar, Growth and Skills), and Admin (Settings). Navigation is role-aware: `lib/rbac.ts` maps archetype to allowed items. Admin shows only to executives. Clients shows full identity only above the wall. Growth and Skills is hidden in v1 (built in Phase 9).
- **Personal layer** at `(personal)`: a dashboard route and a notifications route that exist above any workspace. In v1 the dashboard shows Vidiosa only. Entering a workspace is an explicit action.
- Enforce that no navigation surface ever renders a workspace the user is not a member of.

**Definition of Done.** The below-wall animator sees a sidebar without Admin and without client identity. The executive sees the full sidebar. Both see only Vidiosa in the switcher. Routing between personal and workspace layers works.

---

## PHASE 3 — Projects and Tasks (MVP, pilot one department)

**Goal.** The core work engine that replaces ClickUp. Prove it on a single department before expanding.

**Build.**
- **Projects:** an All Projects view (board and list), a Project Detail view (phases, deliverables, timeline, files, and its task list), project templates, and a New Project flow that scaffolds from a template. Add a `project_templates` table (jsonb structure of default phases and tasks) and a `deliverables` concept (either a column set on projects or a small child table).
- **Tasks:** My Tasks (assignee is the current user, shown with the project code, never a client name), Team Board for leads, and Task Detail with status, revision logging, dependencies, and comments. Add a `task_dependencies` table and a `task_comments` table.
- Wire write policies: contributors update status and revision count on their own tasks; leads create and assign tasks within their team; the Creative Lead owns projects.
- On task completion, set `completed_at`. This is the raw material Phase 7 KPI reads. Do not compute KPI here, just record clean events.

**Definition of Done.** The Creative Lead creates a project from a template and delegates tasks down the reporting line. The animator opens My Tasks, sees only their tasks each labeled with a project code, changes status, and logs a revision. Nothing in the task UI reveals a client identity.

---

## PHASE 4 — Clients and the handoff

**Goal.** Two-faced client records and the automated handoff that fires when a deal closes.

**Build.**
- **Client List and Client Profile**, reading exclusively from `v_clients`. Above the wall the profile shows full commercial detail. Below the wall it shows the code and status only. Never query the base `clients` table from the app.
- **New Client** via a server action that checks the caller is above the wall or revenue, then inserts with the admin client and generates the next `code`.
- **Handoff automation:** on client creation, fire a chain that scaffolds a project from a default template, assigns an owner, and creates notifications for the assigned team. Implement as a Postgres trigger or a server action, whichever keeps the logic in one place. The project created must carry a brand-blind title.

**Definition of Done.** Creating a client produces a client record, a scaffolded project, and notifications, with no manual relay. A below-wall user viewing that project and its tasks cannot determine the client identity or origin at any point in the UI. Re-run the Phase 1 wall test end to end through the interface, not just in SQL.

---

## PHASE 5 — People, HR, and Leave

**Goal.** The org made real, plus leave management routed through the reporting line.

**Build.**
- **Team:** a directory and org chart driven by memberships and `reports_to`, a Person Profile, and a Reporting Lines editor for executives. Changing a reporting line updates both permission scope and KPI rollups because both read the same field.
- **HR and Leave:** a `leave_requests` table and a `leave_balances` table. Request, approval routing up the reporting line with the Operations Manager as the final gate, and balance tracking. Onboarding creates a profile and memberships; offboarding deactivates them.
- RLS on leave: a user sees their own requests, an approver sees their reports' requests, executives see all in the workspace.

**Definition of Done.** A contributor files leave, it routes to their lead and then to the Operations Manager, approval decrements the balance, and the approved dates become available to the calendar in Phase 7. Onboarding and offboarding work through the UI.

---

## PHASE 6 — Notifications and the personal dashboard

**Goal.** The nervous system and the glance surface.

**Build.**
- A `notifications` table: recipient `profile_id`, a `workspace_id` tag on every row (this is the forward-compatibility hook for the future aggregated hub), type, title, body, entity reference, `is_read`, timestamp. Generate notifications from the events already in the system: task assignment, revision returned, project status change, leave decision, handoff.
- RLS: a user selects and updates only their own notifications. System inserts use the admin client.
- Surface notifications in the top bar bell (scoped to the current workspace) and in the personal notification hub (aggregated across memberships, each tagged by workspace). The hub must never render a workspace the user is not a member of.
- Optional: Supabase Realtime for live notification counts.

**Definition of Done.** Actions across the system generate the right notifications to the right people, tagged by workspace. The personal hub aggregates correctly and leaks no non-member workspace.

---

## PHASE 7 — Performance (KPI) and Calendar

**Goal.** Metrics computed from work, and one shared calendar that feeds itself.

**Build.**
- **KPI as SQL views**, never tables. Compute per person from task events: tasks completed, on-time rate (completed_at against due_date), average cycle time, revision rate, throughput. Provide a rollup that follows `reports_to` so a lead sees their team and executives see the studio.
- **Dashboards:** My Performance for everyone, Team Performance for leads, Studio Overview for executives. All read-only.
- **Calendar:** a Studio Calendar and My Calendar that read project due dates and approved leave automatically. Manual entries only for genuinely new events such as a shoot day. Add an `events` table only for those manual and system-sourced entries; do not duplicate deadlines or leave that already live elsewhere, join to them.

**Definition of Done.** KPI numbers are real on first load because data has flowed since Phase 3. No metric requires manual entry. The calendar shows deadlines and approved leave without anyone maintaining it.

---

## PHASE 8 — Admin and settings

**Goal.** Configuration, executives only.

**Build.**
- Roles and Permissions: manage memberships, archetypes, reporting lines, and the `wall_side` per person. This is where the wall line is drawn and adjusted, in data, with no code change.
- Templates Manager for project templates.
- Integrations: placeholders and links for HighLevel (deals originate there) and Discord (team communication stays there). Work OS links to these, it does not replace them.
- Workspace Settings.

**Definition of Done.** An executive can move a person above or below the wall from the UI and the change takes effect immediately on their next read. No schema change required.

---

## PHASE 9 — v2 and the doors

Deferred until v1 is proven in daily use across Vidiosa.

- **Growth and Skills:** assign courses and growth tasks, monitor against the KPI that flagged the need. Growth tasks reuse the task engine.
- **The aggregated multi-workspace hub and switcher:** built only when a real second workspace app exists with its own requirements. The two hooks that keep this cheap are already in place from v1: identity is separate from role, and every notification carries a workspace tag.
- **Owner cockpit:** a future cross-workspace portfolio view for the holding entity, built only when there is a portfolio to view.

Do not build any of Phase 9 during v1.

---

## What we deliberately do not build

- Team chat. Discord stays.
- The sales pipeline. It stays in HighLevel. Work OS begins at deal closed.
- Full payroll and finance. Leave only in v1.
- Multi-workspace machinery. Designed for, not built, until a second app is real.

---

## Global conventions for the build

- Server Components by default. Client Components only where interactivity requires it.
- Every schema change is a migration under `supabase/migrations`. Never edit schema by hand outside migrations.
- RLS is on for every table from creation. A table without a considered policy is a bug.
- Read client data only through `v_clients`. Treat the base `clients` table as write-only from server actions.
- No secret in client code, ever. The service role client lives only in server files.
- UI copy: sentence case, plain verbs, name things by what the user controls. No em-dashes anywhere in the interface copy. Use periods, commas, or colons.
- All UI follows Section 7. Build the shared components first, then compose screens from them. Do not hand-style one-off screens.
- Amber in the UI means a wall boundary and appears only on above-wall screens. Do not use it decoratively, and never show a masking or redaction affordance to below-wall users.
- When a phase is done, write its acceptance test result before moving on.

---

*Work OS. Build Plan. Version 1. Internal. Motion Magic Production LLC.*
