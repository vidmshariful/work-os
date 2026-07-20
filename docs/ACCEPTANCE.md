# Work OS acceptance test results

Written per phase, as required by the build plan ("When a phase is done, write its acceptance test result before moving on").

## Phase 0 — Project setup ✅ (2026-07-02)

- Next.js 15.5 (App Router, TypeScript, Turbopack), Tailwind v4, shadcn/ui installed and configured.
- Three Supabase clients in place: `lib/supabase/client.ts` (browser), `server.ts` (cookie-bound), `admin.ts` (service role, `server-only` import guard). Session-refresh middleware active.
- Auth: `/login` with email + password, protected layouts redirect signed-out visitors, sign out from the user menu.
- Design system per Section 7: tokens in `globals.css`, Inter + IBM Plex Mono via `next/font`, all primitives built before feature screens.
- Secrets only in `.env.local` (git-ignored, verified `.env*` + `!.env.example` rules). `.env.example` committed with empty values.
- Verified: user created in Supabase Auth can log in and land on the protected shell, and sign out.

## Phase 1 — Data model and the brand wall ✅ (2026-07-02)

Eight ordered migrations applied to the live project via `npm run migrate`. Seeded 7 people across the wall, 3 clients, 3 projects, 24 tasks with completion history, leave, events, announcements.

Wall acceptance test (`npm run wall-test`, runs through PostgREST with real user JWTs):

| Check | Result |
|---|---|
| Below-wall animator: `v_clients` returns every client's code + status | PASS (3 rows) |
| Below-wall: `commercial_name`, `contact_name`, `contact_email`, `origin`, `contract_value` all null | PASS |
| Above-wall Operations Manager: real values incl. `origin = ghl_video`, contract 12000 | PASS |
| Direct `select * from clients` denied for both users | PASS |
| Below-wall `select * from workspaces` returns only Vidiosa | PASS |
| Projects readable with brand-blind titles | PASS |

## Phase 2 — App shell and navigation ✅ (2026-07-02)

- Below-wall animator (rakib@): sidebar shows Work / People / Insight groups, **no Admin**, My Tasks count badge, only Vidiosa in the icon rail. Verified in browser.
- Executive sidebar includes Admin (rbac mapping; verified in code and at runtime below).
- Personal layer (`/dashboard`, `/notifications`, `/account`) above the workspace layer; entering a workspace is explicit.
- No navigation surface renders a non-member workspace: the rail and switcher render only from the user's own memberships (`getSession()`), and RLS on `workspaces` makes anything else unreadable anyway.

## Phase 3 — Projects and tasks ✅ (2026-07-02)

- Projects: list + board views with completion rings, status/owner filters, New Project flow scaffolding phases, tasks, and deliverables from a template, project detail with phase-grouped tasks, deliverables checklist, files (private bucket, signed URLs through server actions), timeline, and assigned-people rail.
- Tasks: My Tasks grouped by status or due date with quick status changes, Team Board (leads and up), task detail with description, dependencies, revision log, and comments.
- Verified in the browser as the below-wall animator: only their tasks, each labeled by project code, status change succeeded through the server action under RLS with the contributor column guard. Nothing on any task surface reveals a client identity.
- `completed_at` is set by a trigger and never typed; revision counts bump from `task_revisions` inserts.

## Phase 4 — Clients and the handoff ✅ (2026-07-02)

- Client list and profile read exclusively from `v_clients`. Above the wall: commercial names, contacts, origin, contract values, amber Confidential chip on niche-brand clients only. Below the wall (verified in browser as the animator): a client is a code, full stop. No name column, no placeholders, no locks.
- New Client runs through a server action that checks above-wall/revenue, then inserts with the admin client.
- **Live handoff test**: created "Solstice Skincare" (origin GHL Video) through the UI as the Operations Manager. The database trigger generated CLT-1004, scaffolded PRJ-1004 "Explainer video production" (brand-blind title) with 5 phases, 10 tasks, and 3 deliverables from the default template, assigned the Creative Lead as owner, and notified the owner plus both executives, all referencing codes only. No manual relay.
- Found and fixed in this test: `next_code()` had an ambiguous column reference under plpgsql (migration `0009_fix_next_code.sql`).

## Phase 5 — People, HR, and leave ✅ (2026-07-02)

- Team directory and org chart driven by `reports_to`; person profiles with per-person KPI (visible to self, their lead, and managers); reporting-line editor and onboarding/offboarding for executives (admin client after explicit executive check).
- Leave: request form (weekday count computed server-side), routing up the reporting line with lead endorsement and the executive final gate, transition rules enforced by a database trigger.
- **Live approval test**: approved the animator's seeded pending request as the Operations Manager. Status moved to approved with `decided_by` stamped, the balance decremented 3 days by trigger, the requester was notified, and the dates now feed the calendar.

## Phase 6 — Notifications and the personal dashboard ✅ (2026-07-02)

- `notifications` table carries a `workspace_id` tag on every row. Generated by database triggers for task assignment, revisions, comments, project status changes, leave routing and decisions, and the handoff.
- Top-bar bell shows workspace-scoped unread count with Supabase Realtime live inserts; the personal hub aggregates across memberships, tagged by workspace, with mark-read actions. RLS: recipients only; inserts are system-side only.

## Phase 7 — Performance and calendar ✅ (2026-07-02)

- KPI is SQL views only (`v_kpi_person`, `v_kpi_rollup` with a recursive reports_to chain), `security_invoker` so reads stay under the caller's RLS. My Performance for everyone, Team for leads (subtree computed from the same reports_to), Studio for executives.
- Numbers were real on first load from seeded work: the animator's 0% on-time rate traces to his one completed task being a day late. No metric is typed by hand.
- Calendar: month grid + this-week agenda joining project due dates, approved leave, and manual events live. Nothing duplicated into the events table; manual entries only for shoots, meetings, holidays.

## Phase 8 — Admin and settings ✅ (2026-07-02)

- People: per-membership Role, Archetype, Wall side, Reports to, and Active controls saving through the user client (RLS restricts to executives). The wall line is drawn in data; `v_clients` and every policy read `wall_side` per query, so a change applies on the person's next read with no code change.
- Templates manager with a full structure editor (phases, tasks, deliverables, default flag that clears the previous default).
- Integrations: HighLevel and Discord as external links, honestly labeled. Workspace settings: rename plus accent color.

## Post-build fixes discovered during verification

1. `next_code()` ambiguity (migration 0009), caught by the live handoff test.
2. PostgREST embeds from `memberships` to `profiles` require the `!profile_id` FK hint because `reports_to` also references profiles. Applied across team, admin, performance, projects, tasks, and search queries.

## Clients complete (v1.1, first section) ✅ (2026-07-05)

The client section rebuilt around the studio's real flow: paid → onboard → intake → work.

- **Pipeline:** `stage` replaces the old status (Onboard, Active, Blocked, Black list, Done). List view groups by stage with search and stage/origin/owner filters; the pipeline board (above wall only) supports drag and drop between stages with days-in-stage and outstanding balances on cards. Verified by dragging Bluepine from Blocked to Active in the browser; the move persisted and was logged to the client's activity.
- **Payments:** scheduled payments per client (split plans supported), invoice links, mark-paid, paid/due/overdue states, outstanding totals on the list, board, and profile.
- **Documents:** contracts (draft/sent/signed), proposals, uploads and external links, signed URLs server-side.
- **Intake drives work:** clients carry intake state (not sent/sent/received) and a kickoff timing (immediately / when intake is received / manually). **Live test:** created CLT-1005 with a 50/50 plan and on-intake timing → zero projects existed → marked intake sent, then received → PRJ-1005 scaffolded automatically with 5 phases, team notified, every step logged: "Intake form received. Work can start."
- **Workroom (above wall only):** activity thread mixing team messages and system events, @mentions with notifications (verified: mention on CLT-1001 notified the closer with a code-only title), client to-dos with assignees and due dates, pinned notes, multiple contacts with a primary flag, account facts with computed health (delivered, on-time rate, revision rate).
- **Automation:** a project moving to in progress activates an Onboard or Done client (verified live); blacklisted clients refuse all new work at the database level (verified: insert rejected).
- **The wall, extended:** contacts, payments, documents, activity, to-dos, and notes are above-wall only via RLS; `v_clients` was rebuilt with the new masked columns. The wall test grew from 9 to 21 assertions and passes. Below the wall the client page remains a code, a stage, and its projects; verified in the browser as the animator: no names, no money, no intake, no pipeline view.
- Hardening found during the build: function `EXECUTE` grants revoked from PUBLIC on notify/log/scaffold functions (migration 0011).

## Clients refined: per-project intake, commercials, tabbed workroom ✅ (2026-07-05)

Rework from studio feedback: one client runs many projects, so intake and money move to the project level.

- **Intake per project.** Every client project carries its own intake (not sent / sent / received) with the form link and a submission area: response link plus a pasted summary the team can read where the work happens. Managed from the client's Projects tab and mirrored on the project detail rail. Receiving intake logs to the client activity and notifies the project owner that work can start. Verified live: edited the PRJ-1001 submission from the Projects tab.
- **Project commercials.** Price and invoice terms per project in `project_commercials`, gated by RLS to executives and the project's assigned manager. Verified through the API: the executive reads all rows, the assigned manager reads his own, the above-wall closer reads zero, and below-wall production reads zero. The project detail page renders no trace of the panel for anyone else.
- **Payments link to projects.** Payment rows carry an optional project, shown as a code chip; the Money tab summarizes account value, paid, and outstanding, with a pricing rail for permitted viewers.
- **Tabbed workroom.** The client profile reorganized into Activity, Projects, Money, and Details tabs with counts; loading skeletons added for the clients routes. Kickoff timing simplified to now-or-later since intake now gates work at the project level; the new-client form takes kickoff price and invoice terms and attaches the intake form to the scaffolded project.
- Wall test now 27 assertions, all green. Migration `0012`, plus the intake data migration from clients onto each kickoff project.

## v1.1 Phase A, slice 1 — CRUD and hygiene ✅ (2026-07-09)

First slice of the "Work-ready" plan (`docs/build-plan-v1.1.md`). Migration `0013_phase_a.sql`: `projects.brief`, and the contributor guard relaxed to allow a person to edit the description of their own task (nothing structural).

- **Task CRUD.** Task detail gained inline title editing (leads and up, click to edit, Enter or blur to save), an autosaving description (the assignee and leads, saves on blur), a phase selector in the details rail, and delete with a confirm dialog (leads and up; comments, revisions, and dependencies cascade). Actions: `setTaskDescription` (RLS-gated, serves both the assignee and leads) and `deleteTask`.
- **Project CRUD.** Project detail gained an edit-header dialog (title, type, dates, owner; managers and the owner) and a Brief card with an autosaving textarea shown first in the main column. Actions: `updateProject`, `setProjectBrief`, `restoreProject`. The projects list now hides archived projects by default and reveals them under the Archived status filter, where a Restore action returns them to backlog.
- **Platform hygiene.** Group-level `loading.tsx` skeletons for the workspace and personal layers (clients keep their tailored ones), `error.tsx` boundaries with a retry at the workspace, personal, and root levels, and `not-found.tsx` for both the workspace and the root.
- **Auth.** Forgot-password flow: `/reset` request form → reset email → `/reset/confirm` route handler exchanges the code for a session → `/reset/update` sets the new password. Middleware now exempts `/reset*` so the email link resolves without a session. A "Forgot password?" link sits on the login screen, and Account gained a change-password section.

Verification: `npx tsc --noEmit` clean; `npm run build` clean (26 routes, the three reset routes included); `npm run wall-test` all 27 assertions pass, untouched. The relaxed guard was checked live through PostgREST as the below-wall animator: editing his own task's description succeeded, editing its title was refused by the trigger.

Not verified end to end (no inbox in this environment): the reset-email round trip. It needs the `/reset/confirm` redirect URL allow-listed in the Supabase Auth settings. The change-password section on Account, which reuses the same `updatePassword` action under an existing session, is fully exercised. Deferred within Phase A A6: forcing a password change on first sign-in for onboarding invites, and copy-to-clipboard on the temp password.

## v1.1 Phase A, slice 2 — notifications that go somewhere, and activity history ✅ (2026-07-09)

A2 and A5 of the "Work-ready" plan. Migration `0014_activity_log.sql`: a workspace-scoped `activity_log` table written only by triggers (security definer, no user insert policy), read by any member. Everything logged is brand-blind (task and project facts), so it is safe below the wall.

- **Notifications resolve to a URL.** `lib/notifications.ts` maps a notification's `entity_type` + `entity_id` to a route in its own workspace (task, project, or the HR page for leave). The top-bar bell renders each item as a link that marks it read and navigates on click, and now shows a numeric badge once the unread count passes three (a dot for one to three). The personal hub rows are links too, each resolved in the notification's own workspace via the membership's slug, with optimistic read state and a Mark-read button for items that have nothing to open. Unread state stays in sync across bell and hub.
- **Activity history.** Triggers on `tasks` (status, assignee, due) and `projects` (status, owner, dates) write to `activity_log`. Task detail gains an Activity card in the rail and project detail gains an Activity panel, each showing the last twenty entries as "&lt;Actor&gt; moved this to review, 2h ago". The actor is the acting user, or "System" for trigger and admin-side writes.
- **Scope note.** Per-entity activity for leave decisions and clients was left to their existing surfaces (leave notifications and the wall-safe client workroom thread) rather than duplicated into `activity_log`, since neither has an Activity rail in this slice and a second client log would be redundant wall surface for no benefit. The generic log covers the two entities that got panels.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 27 assertions pass, untouched. The activity trigger was checked live through PostgREST: the below-wall animator changed a task's status and the row was logged with verb `status_changed` and his id as the actor, readable back under his own RLS.

## v1.1 Phase A, slice 3 — subtasks and drag-and-drop ✅ (2026-07-09)

A4 and most of A3. Migration `0015_subtasks.sql`: `tasks.parent_task_id`, a one-level-deep trigger, the contributor guard extended to keep reparenting out of a contributor's reach, and `v_kpi_person` rebuilt to count leaf tasks only.

- **Subtasks (A4).** A task can carry a parent, one level deep, enforced in the database. Task detail shows a Subtasks card on any top-level task: a checklist with a done/total header and progress bar, each subtask openable as a full task, an add-subtask input for leads, and a neutral note when a parent is marked done while subtasks are still open (a warning, never a block, and never amber). A subtask shows a "Part of &lt;parent&gt;" link back up. My Tasks marks subtask rows with a corner indent and their parent's title. KPI counts leaves only, so a parent container never double-counts. Action: `createSubtask` (leads and up, inherits the parent's project).
- **Drag-and-drop boards (A3).** The team board and the project board are now `@dnd-kit` boards: drag a card to another column to change status. Moves are optimistic with a drag overlay, RLS-checked server-side, and revert with a toast if the write is refused (so a non-owner dragging a project gets a clean "not allowed"). A pointer activation distance keeps a plain click opening the card, and a keyboard sensor is wired for keyboard users. The team board is leads-only, so every card there is movable by the viewer.
- **Deferred within A3:** drag-to-reorder for project phases and deliverables. The two boards were the high-value drag surfaces; phase and deliverable reordering is the remaining A3 item and is noted for a follow-up.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 27 assertions pass, untouched. Checked live through PostgREST as the Operations Manager: a subtask was created under a top-level task, a sub-subtask was refused by the one-level trigger, the self-referential My Tasks parent embed resolved, and `v_kpi_person` stayed valid and queryable after the leaf-only rewrite. Test rows were cleaned up.

## My Zone and the Dashboard rename ✅ (2026-07-09)

Sidebar reorganized around a personal layer. Migration `0016_personal_todos.sql`: an owner-only `personal_todos` table.

- **Home is now Dashboard** (menu label, icon, and page title). The route stays `/home`.
- **New "My Zone" nav group** for every archetype: Dashboard (overview), My Tasks (assigned work), and My To-dos. The Work group is now Clients + Projects.
- **My To-dos** is a private checklist: add with an optional due date, check off, delete. Owner-only RLS, verified live through PostgREST: the owner creates and reads their own to-do, and a second user cannot see it.

## Phase D1 — departments as spaces (foundation) ✅ (2026-07-09)

Migration `0017_departments.sql`: `departments`, `department_members`, and `project_lists` tables; `projects` gains `department_id` and `list_id`; the `app_can_see_department()` helper; scoped-visibility RLS.

- **Hierarchy:** Department → List (optional) → Project → Task. Four departments are prebuilt: Animation Studio, Video Editing, Marketing, Operations (the plan's "Admin" department renamed so it does not clash with the Admin settings nav).
- **Scoped access:** executives see every department; everyone else sees only departments they are a member of. `projects_select` and `tasks_select` were tightened to respect it, with a safe fallback: a project with no department stays visible to all members (so nothing is ever accidentally hidden).
- **Wall unaffected:** department scoping is a "need to know" org layer on top of the wall. Client identity is still masked by `v_clients` regardless of department, and department and list names are internal and brand-blind.
- **Backfill + seed:** existing projects were filed into the default department (Animation Studio), and department membership was bootstrapped from roles. `seed.mjs` does the same for fresh databases.
- **Deferred to later D slices:** the handoff trigger is unchanged, so a newly scaffolded client project lands unfiled (visible to members) until an executive files it; handoff → department mapping comes in D4.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 27 assertions pass, untouched. Scoping checked live: the four departments backfilled, the below-wall animator sees only Animation Studio, an executive-created Marketing project is invisible to that animator but visible to the executive, and the animator still sees all seven Animation Studio projects. Check rows cleaned up.

Remaining Phase D: D2 (department + list pages, project/list creation flows), D3 (collapsible sidebar department tree), D4 (admin department management, handoff → department, wall-test extension).

## Phase D2 — department pages and the create flows ✅ (2026-07-09)

The departments foundation from D1 becomes usable in the UI. No schema change.

- **Departments nav item** in the Work group, leading to a departments index: the spaces the viewer can see, each a card with project and list counts.
- **Department page** (`/[ws]/departments/[slug]`): the department's lists rendered as sections, each with its projects and a per-list "New project" action; an Unlisted section for projects filed to the department but no list; header actions for New List (leads and up) and New Project (managers).
- **Create flows:** `createList` / `deleteList` actions (leads and up; deleting a list unfiles its projects). The New Project form gained Department and List selectors, prefilled when launched from a department or a list (`?department=&list=`). Deleting a list leaves its projects in the department.
- **Move a project:** the project edit dialog gained Department and List selectors; moving to a new department clears the old list. `updateProject` and `createProject` both handle `department_id` + `list_id`.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 27 assertions pass, untouched. Flow checked live as the Creative Lead: created a list in Animation Studio, filed a project into that department and list, confirmed a department member sees it, then moved the project to Video Editing and saw the list clear. Check rows cleaned up.

Remaining Phase D: D3 (collapsible sidebar department tree), D4 (admin department management: create/rename departments, membership, plus handoff → department mapping and the wall-test extension).

## Phase D3 — the sidebar department tree ✅ (2026-07-09)

The Work section's flat "Departments" link became a collapsible tree, the ClickUp-style navigation. UI only, no schema change.

- **`DepartmentTree`** renders a Departments header (to the index) followed by each visible department as an expandable row: chevron, accent dot, name (links to the department page), and its lists nested beneath. The active department auto-expands; a department with no lists shows a dimmed chevron.
- **List jump links:** each list links to `/[ws]/departments/[slug]#list-<id>`, and the department page's list sections carry matching anchors, so clicking a list scrolls to it.
- Wired once through the shared `Sidebar`, so desktop and the mobile drawer both get the tree. The tree data (departments + their lists, RLS-scoped) is fetched in the workspace layout and threaded through the topbar and mobile nav. Only departments the viewer belongs to appear, so the tree honors scoping and the wall.

Verification: `npx tsc --noEmit` clean; `npm run build` clean, with `/[ws]/departments` and `/[ws]/departments/[slug]` registered; `npm run wall-test` all 27 assertions pass, untouched. (A stale `.next` cache produced a spurious page-collection error mid-session; a clean rebuild passes — worth an `rm -rf .next` if it recurs.)

Remaining Phase D: D4 (admin department management: create/rename/reorder departments and membership; handoff → department mapping so new client projects auto-file; wall-test extension for department scoping).

## Phase D4 — admin management, handoff auto-filing, and three bug fixes ✅ (2026-07-10)

The departments system's finish line. Migrations `0018`–`0021`.

- **Handoff auto-files by origin** (`0018`): a new `t2_clients_file_dept` after-insert trigger runs after the scaffold (`t1_clients_handoff`) and files the new project into a department by the client's origin (`ghl_video` → Video Editing, `ghl_animation` → Animation Studio), falling back to the workspace default. The large handoff function stays untouched. Verified live: all three origins scaffold and file into the expected department.
- **Admin → Departments** tab: executives create departments (name + accent, auto-slug), rename (slug stays fixed so handoff mapping and links hold), set the default, delete (blocked while default; projects unfile), and manage each department's members inline. Actions are executive-gated by capability and RLS. Verified live: an executive creates/renames/deletes and adds a member who then sees the department; a contributor is refused.
- **Wall test extended:** three department-scoping assertions are now part of `wall-test.mjs` (animator sees only their departments; executive sees all; the animator's visible projects all sit within their departments). The suite is now 30 assertions.

**Three bugs found and fixed while verifying the handoff** (the first end-to-end handoff run since the client rework — the seed disables the handoff trigger, so these were latent):

1. `0019` — `scaffold_kickoff_project` crashed with "record tpl is not assigned yet" when a client had no kickoff template. Collapsed the two-step template lookup into one coalesced `select into` so `tpl` is always assigned. **Client creation without a template was broken.**
2. `0020` — `clients_stage_bookkeeping` still referenced `new.intake_status` and the `intake_*` columns that `0012` dropped when intake moved to the project level. As a BEFORE UPDATE trigger it broke **every** client update (edits, stage moves, the handoff's `kickoff_done` write). Removed the obsolete intake block.
3. `0021` — `departments_select` used `app_can_see_department(id)`, which self-queries the departments table; during `INSERT ... RETURNING` the new row isn't yet visible, so an executive creating a department with a returning clause was rejected. Rewrote the policy to check the row's own `workspace_id` directly. (The `createDepartment` action avoided it by not selecting, but it was a real latent bug.)

Verification: `npx tsc --noEmit` clean; `npm run build` clean (`/[ws]/admin/departments` registered); `npm run wall-test` all 30 assertions pass. Live checks (handoff origin mapping, admin department CRUD + membership + RLS refusal) all pass; check rows cleaned up.

**Phase D is complete.** Departments as spaces, scoped access, list/project hierarchy, the sidebar tree, admin management, and handoff auto-filing are all in and verified.

## Feature: My To-dos becomes a personal board ✅ (2026-07-10)

My Zone's to-do list grew into a real personal work surface. Migration `0022`: `todo_stages`, `todo_labels`, `todo_label_links`, `todo_checklist_items`, plus `stage_id`, `priority`, and `notes` on `personal_todos`. Every table is owner-only, no wall exposure.

- **Custom stages, board + list.** Users define their own kanban columns (name + color). A to-do with no stage sits in an implicit **Inbox** column, so existing to-dos work day one. A List/Board toggle (`?view=board`) shows the same stages either way, ClickUp-style. The board uses `@dnd-kit`: drag a card between columns (optimistic, reverts on error). Stages are added, renamed, recolored, and deleted from a per-column popover; deleting a stage drops its to-dos back to Inbox.
- **Richer to-dos.** A detail dialog (click any card) holds **notes**, a **priority** flag (normal/high/urgent, shown as a colored tag on cards), **labels** (user-defined colored labels, created and attached inline), and a **checklist** of sub-items with an x/y count. The done checkbox stays for one-click completion; done items dim, strike through, and sink to the bottom of their column.
- Cards surface priority, due date, checklist progress, a notes marker, and label chips at a glance.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 30 assertions pass, untouched. Checked live: an owner creates a stage, label, to-do, label link, and checklist item; the page's nested embed query resolves the labels and checklist; and a second user sees none of it (owner isolation). Check rows cleaned up.

## To-dos: default stages, reorder, checkbox-to-done, and due reminders ✅ (2026-07-10)

Migrations `0023`–`0024`.

- **Three default stages per user** — Backlog (default landing), In Progress, Done (done column) — seeded by a trigger on membership and backfilled for existing members. The implicit Inbox is gone; existing stage-less to-dos moved into Backlog. New to-dos land in Backlog. `0024` guarantees anyone who already had stages gets exactly one default and one done stage (one account had pre-existing stages the seed skipped).
- **Fully editable stages:** rename, recolor, delete (its to-dos fall back to the default), **reorder** (move earlier/later in the stage editor), and re-designate which stage is **Default** or **Done** via toggles.
- **Checkbox ↔ Done, in sync:** checking a to-do moves it into the done column; unchecking returns it to the default column; dragging a card into the done column checks it. Kept consistent server-side in `toggleTodo` and `updateTodo`, with optimistic moves on the client.
- **Due-date reminders:** `notify_due_personal_todos()` notifies owners of to-dos due today or overdue and not done, once per day (a `reminded_on` stamp guards repeats). Scheduled daily at 08:00 UTC via **pg_cron** (`todo-due-reminders`). Reminders resolve to `/[ws]/todos` in the bell and hub.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 30 assertions pass, untouched. Confirmed live: every member has three default stages with one default + one done; the pg_cron job is registered; a to-do due today generates one reminder and stamps `reminded_on`, and a second run does not duplicate; checking a to-do lands it in the done stage under the owner's RLS. Check rows cleaned up.

## ClickUp-style Work area — Phase A: structure, navigation, the List page ✅ (2026-07-15)

Migration `0025`: `projects.parent_project_id` with a one-level-deep guard, and the handoff origins repointed to the Production space.

- **Four spaces.** The work area was reorganized to Production, Marketing, Sales, Administration (animation-studio → Production keeping its projects; video-editing folded into a Video Editing *list* inside Production; operations → Administration; Sales added). Membership re-derived by role. `seed.mjs` and the wall test updated to match; a `demo-work.mjs` script performs the reorg and seeds ClickUp-style demo data.
- **Demo data.** Lists per space (Production: Custom, Premade, Video Editing), projects filed into them, and an **onboarding series** parent project with four sub-project videos (Welcome, Walkthrough, Setup guide, FAQ) owned by three different people, plus tasks.
- **Sub-projects.** A project can hold child projects, one level deep. Project detail shows a Sub-projects card (with an add form for managers) and a "Part of &lt;parent&gt;" link on children; sub-projects inherit the parent's space, list, and client but carry their own owner and tasks.
- **The List page.** Clicking a list opens `/[ws]/departments/[slug]/lists/[listId]` with a **List / Board / Calendar** view switcher of its projects — the List view nests sub-projects under their parent, Board reuses the drag-drop project board, Calendar is a month grid placing projects on their due dates.
- **Navigation.** The sidebar tree stops at List and links each list to its page (no projects in the tree, per the studio's request). "Departments" relabeled to **Spaces** across the nav, index, breadcrumbs, and admin tab; departments remain the underlying scoped, wall-safe entity.

Verification: `npx tsc --noEmit` clean; `npm run build` clean (the List route registered); `npm run wall-test` all 30 assertions pass — the animator now sees his 15 Production projects, still scoped. Live checks: the onboarding series has four sub-projects across three owners, the one-level cap rejects a sub-sub-project, and the four spaces are in order.

Remaining ClickUp phases: B (project task views + filter bar), C (multiple assignees, task tags, attachments, watchers, review loop), D (ClickUp CSV importer), E (bulk actions, favorites, shortcuts).

## Database — Phase 1: Airtable-style tables ✅ (2026-07-15)

The Retable replacement the original plan pointed at. Migrations `0026`–`0027`.

- **Schema.** `db_tables`, `db_fields` (name + type + options), `db_rows` (values as jsonb keyed by field id, so adding a column never touches the schema), and `db_shares`. Field types: text, long text, number, date, checkbox, select, URL, person.
- **Two scopes.** Managers and executives create **company** tables by default, visible workspace-wide. Everyone else creates **personal** tables, private until shared. A contributor can "Add this to the company database too", which promotes the table and marks it `contributed` so it reads as *shared by the team*.
- **Sharing.** Per-person shares with view or edit rights, on top of scope. Enforced by RLS via `app_can_see_table()` / `app_can_edit_table()`.
- **UI.** A Database nav item; an index split into Company database / My tables / Shared with me; and a table page with an **inline-editable grid** — click a cell to edit, add a field (choosing its type, with choices for select), add or delete rows. A share dialog manages people, rights, and promotion.
- **Wall note.** Rows are free-form text, not client records, so nothing here is masked by `v_clients`. Sharing is the access control, and the share dialog cautions against putting client identity in a table shared below the wall.
- `0027` fixes the same class of bug found in `0021`: the `db_tables` select/update policies must not call a helper that re-queries `db_tables` for the row's own id, or `INSERT ... RETURNING` is rejected. They now reference the row's own columns; the child tables still use the helpers safely.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 30 assertions pass, untouched. The visibility model was exercised live as three real users: a contributor creates a personal table (returning works), it stays hidden from everyone including an executive, a shared viewer can read but cannot add rows, granting edit lets them add one, and promoting it makes it company-wide and marked contributed. Check rows cleaned up.

Next: Phase 2 — Docs (native wiki pages, uploaded files of any format with in-app preview including .html, and embedded external links such as Google Docs), sharing the same scope model.

## Database — Phase 2: Docs ✅ (2026-07-15)

Migration `0028`: a `docs` table covering three kinds, `doc_shares`, and a private `doc-files` storage bucket. Scope and sharing mirror the tables feature exactly, and the policies reference their own columns so `INSERT/UPDATE ... RETURNING` works (the 0021 / 0027 lesson applied up front).

- **Page** — a wiki page written in the app in markdown, edited in place with an Edit/Done toggle and autosave on blur.
- **File** — upload any format up to 25 MB. HTML, PDF, text, and images preview inside the app; anything else offers a download. The bucket is private and previews use short-lived signed URLs minted server-side.
- **Link** — an external URL. Google Docs, Sheets, and Slides are rewritten to their `/preview` form and framed inline when public; every link also opens in a new window.
- Docs sit beside Tables under one **Database** nav item with a Tables / Docs switcher, and the index splits into Company database / My docs / Shared with me.

**Two security decisions worth recording.** Uploaded HTML is framed with an empty `sandbox` attribute, so an uploaded page cannot run scripts or reach the app session. And the markdown renderer escapes the entire source before adding any tags of its own, and only lets `http(s)`/`mailto` through as link hrefs, so a page written by one person cannot execute in another person's browser.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 30 assertions pass, untouched. Live, as three real users: the bucket exists, a contributor creates a personal doc (returning works), it stays hidden from an executive, a shared viewer can read but cannot edit the content, granting edit lets them change it, and promoting makes it company-wide and marked contributed. The renderer was tested against hostile input: script tags and `onerror` images are escaped, `javascript:` hrefs are stripped, and safe links and formatting survive. Check rows cleaned up.

Next: Phase 3 — polish (more field types, table filters and views, richer file previews).

## Database — Phase 3: field types, filtering, richer previews ✅ (2026-07-15)

Polish across both halves of the Database. No migration needed: field types are validated in the action and stored in a text column, so the set grows without touching schema.

- **Three new field types.** **Multi-select** (choices as colored chips, edited through a checklist popover, stored as a jsonb array), **Email** (renders as a mailto link), and **Phone** (renders as a tel link). Select and multi-select both take comma-separated choices when the field is created.
- **Search, filter, and sort** on every table. A search box scans every field of every row, including person names and multi-select values. Filtering picks a field then a value, with a dropdown for select, multi-select, checkbox, and person fields and a contains-match for everything else. Sorting takes a field and a direction, numeric for number fields. A row counter shows "n of m rows" and one Clear resets everything.
- **Richer file previews.** Markdown files render through the same escaping renderer as wiki pages, CSV renders as a real table (with a small parser that understands quoted fields and escaped quotes), JSON is pretty-printed, and plain text is shown as-is. HTML and PDF still use the locked-down sandboxed frame, images render inline, and unknown formats offer a download. Text is read server-side and capped at 512 KB so a large file cannot stall the page.

Verification: `npx tsc --noEmit` clean; `npm run build` clean; `npm run wall-test` all 30 assertions pass, untouched. The CSV and JSON helpers were unit-tested (quoted commas stay in one cell, escaped quotes unescape, invalid JSON passes through untouched, preview kinds detect correctly), and the new field types were exercised live: a multi-select field is created with its choices, an array value round-trips through jsonb, and an email field is accepted. Check rows cleaned up.

## Admin Control Center ✅ (2026-07-20)

The one place an admin configures the workspace, turns features on and off, and decides who owns what. Migration `0029`, additive only: nothing dropped, no column altered, no row deleted.

**The principle, built structurally.** A setting lives once at the workspace level and every screen reads it from there. Nothing is copied into a member's account, so "it applies to everyone" is not a sync job, it is the absence of a second copy. `lib/data/workspace-settings.ts` is the only module that reads these tables, `getWorkspaceContext()` resolves them once per request, and every nav surface renders from that one result.

- **`workspace_settings`**, one row per workspace with `workspace_id` as the primary key, so one-row-per-workspace is structural rather than a constraint. Display name, timezone, week start day, locale, logo URL, plus a `settings` jsonb catch-all so the next small flag is a write and not a migration. Seeded in the migration for every existing workspace, so nothing ever reads null.
- **`workspace_features`**, unique on (workspace_id, feature_key), with `enabled` and an optional `min_archetype` floor. Nine keys seeded enabled: spaces, clients, projects, database, team, hr, performance, calendar, todos. **home, tasks, and admin are deliberately absent and un-toggleable**, guarded in two places: the action refuses them and the read path ignores a row for one even if inserted by hand. An executive who could switch off Settings would lock themselves out with no way back in.
- **The archetype ladder, defined once:** executive 4 > domain_manager 3 > team_lead 2 > contributor 1, with revenue at 1 alongside contributor. Archetypes are not naturally ranked, so this ordering lives in exactly one place.
- **Ownership reuses what already existed.** `clients.owner_id` and `projects.owner_id` were already there and are reassigned as is. Spaces and lists genuinely had no owner column, so `0029` adds `departments.lead_id` and `project_lists.owner_id`, both nullable and `on delete set null` so removing a person never removes the space. This is not a second permissions engine: reporting lines and archetypes remain the truth.
- **RLS from creation.** Any member may SELECT both tables, because everyone needs the applied settings and settings are not client identity. Only the executive archetype may INSERT or UPDATE. No DELETE policy on either: a settings row is permanent and a feature is turned off, never removed. Both policies pass the row's own `workspace_id` into helpers that read `memberships`, so neither self-queries and `INSERT ... RETURNING` works. The 0021 / 0027 / 0028 lesson applied up front and then proven, not assumed.
- **Three server actions** in the existing `lib/actions/admin.ts` beside `updateMembership`, not duplicating it: `updateWorkspaceSettings` (timezone validated against the runtime's own timezone database), `toggleFeature`, and `reassignOwner` covering space, list, project, and client. Every one re-checks executive on the server. Client owner writes go through the admin client after an explicit above-wall check, exactly as `lib/actions/clients.ts` does, because the base table stays revoked.
- **Three tabs** added to the existing admin area: General, Features, Ownership. The old Workspace tab is folded into General by reusing `WorkspaceForm`, so workspace identity is edited in one place rather than two, and `/admin/workspace` still resolves. Composed from `components/primitives/`; three small pieces (`SettingRow`, `ToggleRow`, `OwnerPicker`) are built once in `control-rows.tsx` and reused across all three tabs.

**Branding decision worth recording.** `workspaces.accent_color` stayed where it is and only `logo_url` is new. Putting branding in `workspace_settings` as well would have created exactly the two-sources-of-truth drift this table exists to prevent. One fact, one home.

**Wall safety.** `v_clients`, the wall predicates, `lib/wall.ts`, and `scripts/wall-test.mjs` were not touched. The Ownership tab reads clients only through `v_clients` and renders that section only above the wall, and when it does not render there is no placeholder, no notice, and no gap: the page is simply about spaces, lists, and projects.

Verification: `npx tsc --noEmit` clean; `npm run build` clean (three new routes registered); eslint clean on every new and changed file; `npm run wall-test` all 30 assertions pass with the file confirmed unmodified by `git status`. Sixteen policy assertions passed live as real users: the seed landed, a below-wall contributor reads settings and features but cannot change either (insert refused by RLS, updates match no rows), and both `INSERT ... RETURNING` and `UPDATE ... RETURNING` work for an executive. Ownership was exercised live: an executive sets a space lead, list owner, and project owner, a contributor cannot, and the `clients` base table still refuses a direct write even for an executive. Thirty-four end-to-end assertions passed **against a production build**, not the dev server: the executive reaches all three tabs and sees a real client name, the contributor is redirected away from every admin URL with no admin control in the response and no client identity anywhere, and toggling Performance off removed it from the contributor's sidebar and the executive's alike, one source reaching both. All test rows and values restored.

One finding worth recording: Next issues a redirect raised during render as a `<meta http-equiv="refresh">` rather than a 3xx, so an acceptance test that asserts on the status code reports a false failure. The tests assert on the redirect target and on the absence of admin markers in the body instead, which is the stronger check. A partially streamed RSC payload can carry a serialized prop from the aborted render (one card title appeared this way); no control, no form, and no client identity reaches the response, and this was confirmed on the production build.

Deferred: nothing from the agreed scope. Out of scope and left untouched by instruction: `authenticated` holds broad grants on `v_clients` that were re-granted after `0003`. They are inert, because the lateral join for the primary contact makes the view non-auto-updatable (`is_insertable_into` and `is_updatable` both report NO), so no write can pass through it. Worth tightening in a future migration for defence in depth.

## Final state (v1 + client deep-dive)

- `npx tsc --noEmit` clean, `npm run build` clean (24 routes), `npm run wall-test` all pass.
- Deferred per the plan: Growth and Skills, multi-workspace hub, owner cockpit (Phase 9). Team chat and the sales pipeline stay in Discord and HighLevel.
