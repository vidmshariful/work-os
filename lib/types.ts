// Shared row types for the Work OS schema. Keep in sync with
// supabase/migrations. Client identity fields are nullable because the app
// only ever reads clients through v_clients, which masks them below the wall.

export type RoleType =
  | "ceo"
  | "cfo"
  | "ops_manager"
  | "creative_lead"
  | "marketing_manager"
  | "design_lead"
  | "animation_lead"
  | "editing_lead"
  | "designer"
  | "animator"
  | "editor"
  | "marketer"
  | "closer"
  | "appointment_setter";

export type Archetype =
  | "executive"
  | "domain_manager"
  | "team_lead"
  | "contributor"
  | "revenue";

export type WallSide = "above" | "below";
export type BrandOrigin = "direct" | "ghl_video" | "ghl_animation";
// The relationship pipeline. Onboard: paid, being set up. Active: work
// running. Blocked: on hold. Blacklist: never again. Done: delivered, can
// return to Active on a reorder.
export type ClientStage = "onboard" | "active" | "blocked" | "blacklist" | "done";
export type KickoffTiming = "immediate" | "on_intake" | "manual";
export type IntakeStatus = "not_sent" | "sent" | "received";
export type ContractStatus = "none" | "draft" | "sent" | "signed";
export type ProjectStatus =
  | "backlog"
  | "in_progress"
  | "review"
  | "delivered"
  | "archived";
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveType = "annual" | "sick" | "unpaid" | "other";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  accent_color: string;
  created_at: string;
}

// Workspace-level settings, one row per workspace. Read by every member,
// written by executives only. Settings live here once and every screen reads
// them from here, so an admin change is true for everyone on their next read.
// accent_color stays on workspaces: one fact, one home.
export interface WorkspaceSettings {
  workspace_id: string;
  display_name: string | null;
  timezone: string;
  week_start_day: number;
  locale: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

export interface WorkspaceFeature {
  id: string;
  workspace_id: string;
  feature_key: string;
  enabled: boolean;
  min_archetype: Archetype | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Membership {
  id: string;
  profile_id: string;
  workspace_id: string;
  role: RoleType;
  archetype: Archetype;
  reports_to: string | null;
  wall_side: WallSide;
  is_active: boolean;
  created_at: string;
}

// The masked client, as returned by v_clients. Commercial fields are null
// for below-wall readers. The app never reads the base clients table.
export interface VClient {
  id: string;
  workspace_id: string;
  code: string;
  stage: ClientStage;
  stage_changed_at: string;
  owner_id: string | null;
  created_at: string;
  commercial_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  origin: BrandOrigin | null;
  contract_value: number | null;
  website: string | null;
  highlevel_url: string | null;
  kickoff_template_id: string | null;
  kickoff_timing: KickoffTiming | null;
  kickoff_done: boolean | null;
}

// Per-project intake: one client runs many projects, each engagement
// collects its own intake. Above-wall only.
export interface ProjectIntake {
  project_id: string;
  status: IntakeStatus;
  form_url: string | null;
  sent_at: string | null;
  received_at: string | null;
  response_url: string | null;
  response_note: string | null;
  updated_by: string | null;
  created_at: string;
}

// Per-project pricing and invoice terms. Readable only by executives and
// the project's assigned manager; RLS returns zero rows to everyone else.
export interface ProjectCommercials {
  project_id: string;
  price: number | null;
  invoice_terms: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}

// ---- the client workroom (above-wall only tables) ----

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role_label: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface ClientPayment {
  id: string;
  client_id: string;
  project_id: string | null;
  label: string;
  amount: number;
  due_date: string | null;
  invoice_url: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  title: string;
  doc_type: string;
  contract_status: ContractStatus;
  storage_path: string | null;
  external_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ClientActivity {
  id: string;
  client_id: string;
  kind: "message" | "system";
  author_id: string | null;
  body: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientTodo {
  id: string;
  client_id: string;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ClientNote {
  id: string;
  client_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  client_id: string | null;
  department_id: string | null;
  list_id: string | null;
  parent_project_id: string | null;
  // 0 normal, 1 high, 2 urgent, the same scale tasks.priority uses.
  priority: number;
  code: string;
  title: string;
  type: string | null;
  brief: string | null;
  status: ProjectStatus;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  // Stamped by a trigger on every update, added in 0032 so a space can be
  // sorted by last updated.
  updated_at: string;
}

export interface Department {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  accent_color: string;
  sort_order: number;
  is_default: boolean;
  lead_id: string | null;
  created_at: string;
  description: string | null;
  // A single emoji, or null for the letter avatar built from the name.
  icon: string | null;
  // Null while the space is active. Archiving hides it from the index and
  // the sidebar; it never changes who is allowed to see it.
  archived_at: string | null;
}

// A folder groups lists inside one space. Optional and one level deep: a
// list with folder_id null sits directly in the space, which is where every
// list sat before folders existed.
export interface ProjectFolder {
  id: string;
  department_id: string;
  name: string;
  sort_order: number;
  // A TagTone key, or null. Same seven the design system draws with.
  color: string | null;
  created_at: string;
}

export interface ProjectList {
  id: string;
  department_id: string;
  name: string;
  sort_order: number;
  owner_id: string | null;
  created_at: string;
  // A TagTone key, or null for no colour. Constrained in Postgres to the same
  // seven the design system draws with.
  color: string | null;
  // Null means the list sits directly in the space rather than in a folder.
  // A composite foreign key guarantees the folder is in the same space, which
  // is what keeps project_lists_select unchanged.
  folder_id: string | null;
  // Null while the list is active. Archiving hides it from the space page and
  // the sidebar; it never changes who is allowed to see it, and the projects
  // inside keep working.
  archived_at: string | null;
}

// Custom fields. The definition lives on the workspace, optionally scoped to
// one space; the value lives on the project. Value shape follows the kind:
// string for text, long_text, url and date; number for number; boolean for
// checkbox; the option's value for select; an array of them for multi_select.
export type ProjectFieldKind =
  | "text"
  | "long_text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "url"
  | "checkbox";

export interface ProjectFieldOption {
  value: string;
  label: string;
  // A TagTone key, or null. Same seven the rest of the app draws with.
  color: string | null;
}

export interface ProjectField {
  id: string;
  workspace_id: string;
  // Null means every space shows it.
  department_id: string | null;
  name: string;
  kind: ProjectFieldKind;
  options: ProjectFieldOption[];
  sort_order: number;
  created_at: string;
}

export type ProjectFieldValue =
  | string
  | number
  | boolean
  | string[]
  | null;

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Deliverable {
  id: string;
  project_id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  phase_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  revision_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// The project-level thread. Same shape as TaskComment, hung off a project.
export interface ProjectComment {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface TaskRevision {
  id: string;
  task_id: string;
  requested_by: string;
  note: string | null;
  created_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

export interface TemplateStructure {
  phases: { name: string; tasks: { title: string; description?: string }[] }[];
  deliverables?: string[];
  // Custom field values stamped onto a project built from this template.
  // Lives in the jsonb rather than its own table because it is part of the
  // template's shape, exactly like its phases and deliverables, and because
  // a field deleted later should simply stop applying rather than leave a
  // dangling row behind.
  fields?: { field_id: string; value: unknown }[];
}

export interface ProjectTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  project_type: string | null;
  structure: TemplateStructure;
  is_default: boolean;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  workspace_id: string;
  profile_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  lead_approved_by: string | null;
  lead_approved_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  workspace_id: string;
  profile_id: string;
  year: number;
  total_days: number;
  used_days: number;
}

export interface Notification {
  id: string;
  profile_id: string;
  workspace_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  verb: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface PersonalTodo {
  id: string;
  profile_id: string;
  workspace_id: string;
  stage_id: string | null;
  title: string;
  notes: string | null;
  priority: number;
  is_done: boolean;
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface TodoStage {
  id: string;
  profile_id: string;
  workspace_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_done: boolean;
  created_at: string;
}

export interface TodoLabel {
  id: string;
  profile_id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ---- Database (Airtable-style tables) ----

export type DbScope = "personal" | "company";
export type DbFieldType =
  | "text"
  | "long_text"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "multi_select"
  | "url"
  | "email"
  | "phone"
  | "person"
  // A stored credential. Encrypted before it reaches the database, masked in
  // the grid, and revealed one value at a time. See lib/secrets.ts.
  | "secret";

// What a secret cell looks like once the server has stripped it. The grid
// renders dots for this and asks for the real value only when someone clicks
// reveal. It lives here rather than in lib/secrets.ts because that module is
// server only and the grid is a client component.
export const SECRET_PRESENT = " secret";

export interface DbFolder {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  color: string;
  scope: DbScope;
  created_at: string;
}

export interface DbFolderShare {
  folder_id: string;
  profile_id: string;
  can_edit: boolean;
}

export interface DbTable {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  color: string;
  scope: DbScope;
  contributed: boolean;
  folder_id: string | null;
  created_at: string;
}

export interface DbFieldOptions {
  choices?: { label: string; color: string }[];
}

export interface DbField {
  id: string;
  table_id: string;
  name: string;
  type: DbFieldType;
  options: DbFieldOptions;
  sort_order: number;
  created_at: string;
}

export interface DbRow {
  id: string;
  table_id: string;
  values: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export interface DbShare {
  table_id: string;
  profile_id: string;
  can_edit: boolean;
}

export type DocKind = "page" | "file" | "link";

export interface Doc {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string;
  kind: DocKind;
  content: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  url: string | null;
  color: string;
  scope: DbScope;
  contributed: boolean;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocShare {
  doc_id: string;
  profile_id: string;
  can_edit: boolean;
}

export interface TodoChecklistItem {
  id: string;
  todo_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
}

export interface WorkEvent {
  id: string;
  workspace_id: string;
  title: string;
  type: string;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  workspace_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// One row per person you can talk to, whether or not anything has been said.
// The list is the team, not a history, so a first message is one click away
// rather than behind a "new conversation" step.
export interface DirectThread {
  person: { id: string; full_name: string; avatar_url: string | null; role: string | null };
  last: { body: string; created_at: string; mine: boolean } | null;
  unread: number;
}
