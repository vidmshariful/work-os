# Work OS — Build Plan v1.1: Work-ready

**The depth pass. From skeleton to daily driver.**
v1 proved the architecture: the wall in Postgres, KPI as exhaust, the handoff as an event. v1.1 makes every surface survive eight hours of real studio use and gives the team a migration path off ClickUp. Same conventions as v1 (`docs/build-plan.md` Section 7 design system, the two non-negotiables, migrations only through `supabase/migrations`).

**The bar for every feature in this plan:** a ClickUp power user lands on the screen and does not reach for ClickUp. Not "the feature exists" but "the third and fourth thing a user tries also works."

**Order matters.** Phase A before Phase C: importing data into a tool that cannot edit it is pointless. Phase B is what makes the team stay. Do not start a phase until the previous phase meets its Definition of Done.

---

## What we deliberately still do not build

Custom statuses per list, configurable view builders, goals/OKRs, sprints, native chat, guest seats. One opinionated pipeline is the product. The wall and computed KPI are the moat. When a request maps to "make it configurable," the answer is a better default, not a setting.

---

## PHASE A — Daily-driver fundamentals

**Goal.** Every entity a user can create, they can also edit, restructure, and delete, with the interactions professionals expect: click-through notifications, drag and drop, visible history, and no dead ends.

### A1. Full CRUD, everywhere

- **Tasks:** edit title and description inline on the detail page (pencil affordance, autosave on blur). Change phase from the detail meta row. Delete task (leads and up) with confirm; dependencies and comments cascade. Contributors may edit the description of their own task, still never assignment fields (extend the guard trigger).
- **Projects:** edit title, type, dates, owner from the detail header (managers or owner). Add a `brief` text column to projects; render as the first card on detail with inline editing. Archive gets an unarchive path (list filter "Archived" plus restore action).
- **Phases and deliverables on live projects:** add, rename, reorder (up/down and drag), and delete phases from project detail; deleting a phase moves its tasks to General. Add, edit, re-date, reorder, and delete deliverables. Leads and up.
- **Comments:** edit and delete own comments (15-minute edit window, "edited" marker).
- **Events:** edit dialog for manual calendar events.
- **Clients:** move the edit form into a dialog opened from the profile header. Add an "Archive client" action with the same status transition rules.

Migration: `0010_phase_a.sql` (projects.brief, guard-trigger update, delete policies for tasks and comments where missing).

### A2. Notifications that go somewhere

- Every notification resolves to a URL server-side: task types to `/[ws]/tasks/[id]`, projects to project detail, leave to `/[ws]/hr`, handoff to the project. Bell items and hub items are links; clicking marks read and navigates.
- Unread state syncs across bell and hub. Bell shows a count badge, not only a dot, when above 3.
- Notification preferences (Phase B ships the settings UI; A hard-codes sane defaults: everything on).

### A3. Drag and drop (@dnd-kit)

- Team board: drag cards between status columns (optimistic, RLS-checked server action, toast on rejection). Contributors can drag only their own cards.
- Project board: drag projects between status columns (managers and owners).
- Phase list and deliverable list: drag to reorder.
- Keyboard-accessible fallbacks stay (the selects remain).

### A4. Subtasks and checklists

- `parent_task_id uuid references tasks` (one level deep, enforced by trigger). Subtasks render as a checklist-style block on the parent detail, each openable as a full task; parent shows x/y done and a mini progress bar; parent cannot complete while subtasks are open (warn, not block).
- KPI counts leaf tasks only (update the KPI views to exclude parents with subtasks from cycle metrics, or count them without double-counting; decide in SQL, document in the migration).
- My Tasks groups subtasks under their parent code with an indent marker.

### A5. Activity history

- `activity_log` table: workspace_id, actor_id, entity_type, entity_id, verb, detail jsonb, created_at. Populated by triggers on tasks (status, assignee, due), projects (status, owner, dates), leave (decisions), clients (status; commercial detail changes log the fact of a change, never the values, so the log stays wall-safe).
- Task detail and project detail right rails get an Activity panel (last 20, "Rakib moved this to Review, 2h ago").
- RLS: members of the workspace read; inserts are trigger-only.

### A6. Platform hygiene

- `loading.tsx` skeletons for every route group (skeleton primitives already exist), `error.tsx` boundaries with a retry affordance, `not-found.tsx` for entities.
- **Auth:** forgot-password flow (Supabase reset email, `/reset` route), change-password section on Account, onboarding invites force a password change on first sign-in (flag in user metadata), copy-to-clipboard on the temp password.
- Timezone: store as-is (dates are dates), render "today/tomorrow" against the user's browser timezone consistently via one helper.

**Definition of Done.** A lead restructures a live project (adds a phase, drags tasks into it, reorders deliverables, edits the brief) without touching a template. A contributor edits their task description, completes subtasks, and the parent shows progress. Clicking any notification lands on the thing itself. A new hire resets their password without an admin. Every route shows a skeleton, never a blank hang.

---

## PHASE B — Team workflows

**Goal.** The collaboration mechanics that make ClickUp sticky, tuned to the studio's actual review-and-revision process.

### B1. The review loop, as one motion

- Submitting a task to Review notifies the reviewer chain (assignee's lead, else project owner) with an actionable notification.
- Task detail grows a Review card for leads: **Approve** (status → done) or **Request changes** (dialog for the note → creates the `task_revisions` row, status → in_progress, assignee notified). One click, one motion; revision_count keeps feeding KPI untouched.
- Review SLA surfacing: tasks sitting in Review over 24h get an amber "waiting Nd" hint on boards and My Tasks (computed, no new state).

### B2. Mentions and watchers

- `@name` autocomplete in comments (members of the workspace); mentioned users are notified and become watchers.
- `task_watchers` (task_id, profile_id): assignee, creator, and mentioners auto-watch; Watch/Unwatch button on detail. Watchers are notified on status changes, comments, and revisions. Notification fan-out triggers update accordingly.
- Notification preferences on Account: per-type toggles (assigned, mentioned, watching, leave, handoff).

### B3. Estimates, time, and workload

- Tasks: `estimate_hours numeric`, `time_entries` table (task_id, profile_id, hours, note, entry_date). Timer-free v1: quick "log time" input on task detail plus My Tasks row hover. Estimated vs logged renders on task and rolls up on project detail.
- **Workload view** (leads and up, a tab on Team): people as rows, next 2 weeks as columns, open tasks placed by due date, cell heat by count and summed estimates. This is where assignment decisions happen; each cell click filters the team board.
- KPI gains utilization and estimate-accuracy per person (views only, as always).

### B4. Task attachments and links

- `task_attachments`: storage uploads (same private bucket, `tasks/` prefix, signed URLs) plus **external link attachments** (Frame.io, Drive, Dropbox) rendered as favicon cards with domain labels. Both on task detail; count badges on board cards.
- Project files panel gains the same link-attachment type.

### B5. Departments

- `department` enum on memberships (design, animation, editing, marketing, operations, sales). Team directory groups by department; team board gains a department filter; leads' default board scope is their own department. Reporting lines stay the permission truth; departments are an organizational lens, not a wall.

**Definition of Done.** An animator submits to review; the lead approves or bounces in one click and the revision trail is intact. A mention pulls someone into a task and they stay informed as a watcher. A lead opens Workload, spots the overloaded editor, and drags a task to Thursday. Estimates versus logged hours appear on the project. Nothing here required a single manually-typed metric.

---

## PHASE C — Migration from ClickUp

**Goal.** The team's existing work arrives in an afternoon, not a month of re-typing. This phase decides adoption.

### C1. The importer

- `/[ws]/admin/import`: upload a ClickUp CSV export (tasks with list, assignee, status, priority, due date, description, subtask relationships).
- **Mapping step:** ClickUp lists → projects (create new or map to existing), ClickUp statuses → the six statuses, assignees matched by email with manual override, unmatched → unassigned with a report.
- **Dry-run first:** a preview table of exactly what will be created, with warnings (unknown assignee, unparseable date). Nothing writes until "Import" on the preview.
- Idempotent: an `import_batches` table records source row hashes so re-running the same file cannot duplicate. Executives only. Imported tasks carry created_at from the source when present, so KPI history isn't distorted (imported completions are marked and excluded from cycle-time KPI, in SQL).
- Ship `docs/migration-guide.md`: how to export from ClickUp, run the import, and validate, written for the team.

### C2. Bulk actions

- Multi-select on My Tasks and Team Board (checkbox on hover, shift-click ranges): bulk status, assignee, due date, phase, delete. One server action, one revalidate, per-row RLS still decides each row and the result toast reports partial failures honestly.

### C3. Scale hygiene

- Pagination or windowed loading on every list at 50+ rows (tasks, notifications hub, activity). DB indexes already exist; add composite ones the importer's volumes reveal (measure, then add, in a migration).
- Global search upgrades: prefix and trigram matching (pg_trgm), recent-entity shortcuts, and result keyboard navigation.

**Definition of Done.** A real ClickUp export of the studio's current workspace imports with a clean dry-run report; counts match the source; a re-run creates zero duplicates. A lead retriages twenty imported tasks in under a minute with bulk actions. Lists stay fast at a thousand tasks.

---

## PHASE D — Insight and polish

**Goal.** The screens executives and leads open on Monday morning become genuinely decision-grade, and the edges get professional finish.

### D1. Performance depth

- Time-range selector (30d, quarter, year, all) driving all KPI views via parameters. Trend sparklines (completed per week, on-time trend) on My/Team/Studio. Every rate is a drill-down: click on-time rate → the list of late tasks behind it. CSV export on every table.

### D2. Calendar completeness

- Week view (the v1 spec promised it). Event editing in place. Per-user ICS feed URL (tokenized, read-only) so deadlines and approved leave appear in Google or Apple Calendar. "Who's out this week" strip on the HR page and the lead's Home.

### D3. Client 360 (above the wall)

- Client notes (timestamped, authored), multiple contacts, a HighLevel record URL field on the identity card, and computed health stats: projects delivered, average revision rate across their projects, lifetime value. Below the wall nothing changes: a client remains a code, and none of these surfaces exist there.

### D4. Leave and HR completeness

- Half-day support (0.5 steps), executive balance-management UI (the policy already allows it; give it the screen), workspace leave defaults in Admin (annual allowance, working days), and a team leave calendar for approvers.

### D5. Home as a morning briefing

- "Waiting on you" block first: reviews to approve, leave to decide, mentions unread. Then overdue and due-today. Leads get a team pulse row (who is blocked, who is out, what is late). Everything links to the thing itself.

### D6. Finish pass

- Keyboard shortcuts (c: new task, g then p: projects, etc., discoverable via ⌘K), command palette gains actions not just navigation. Mobile audit of every screen at 375px. Reduced-motion audit. Copy audit against Section 7.7.

**Definition of Done.** An executive answers "are we faster this quarter than last" in two clicks and exports the evidence. The studio calendar lives in the team's own calendar apps. Monday morning starts on Home and nothing important is more than one click deep.

---

## Sequencing and estimate

| Phase | Size | Depends on |
|---|---|---|
| A — Fundamentals | ~1.5x the original Phase 3 effort | v1 |
| B — Team workflows | similar to A | A |
| C — Migration | smaller, but highest risk (real data) | A (edit before import) |
| D — Insight and polish | medium | A; B3 feeds D1 |

Run the wall test after every phase; it must stay green untouched. Update `docs/ACCEPTANCE.md` per phase as before. The migration guide (C1) is a deliverable, not an afterthought: the team should be able to run their own import.

---

*Work OS. Build Plan v1.1. Internal. Motion Magic Production LLC.*
