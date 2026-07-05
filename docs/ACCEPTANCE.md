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

## Final state

- `npx tsc --noEmit` clean, `npm run build` clean (24 routes), `npm run wall-test` all pass.
- Deferred per the plan: Growth and Skills, multi-workspace hub, owner cockpit (Phase 9). Team chat and the sales pipeline stay in Discord and HighLevel.
