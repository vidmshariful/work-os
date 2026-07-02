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
export type ClientStatus = "active" | "paused" | "completed" | "archived";
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
  status: ClientStatus;
  owner_id: string | null;
  created_at: string;
  commercial_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  origin: BrandOrigin | null;
  contract_value: number | null;
}

export interface Project {
  id: string;
  workspace_id: string;
  client_id: string | null;
  code: string;
  title: string;
  type: string | null;
  status: ProjectStatus;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
}

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
