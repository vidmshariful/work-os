// Shared shapes for the projects feature. Supabase nested selects type
// loosely, so pages cast query results into these.
import type { Project, ProjectField, ProjectStatus, Task } from "@/lib/types";

export interface OwnerRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export type ProjectWithOwner = Project & { owner: OwnerRef | null };

// What a row shows beyond the project itself: the people on it besides the
// owner, and whether anything is written or attached. Loaded per surface and
// looked up by project id, so a view that does not need it passes nothing and
// draws nothing.
export interface RowMeta {
  assignees: OwnerRef[];
  files: number;
}

export type RowMetaMap = Record<string, RowMeta>;

export type TaskWithAssignee = Task & { assignee: OwnerRef | null };

// The same three steps tasks.priority uses, named once so the menu, the flag
// and the server action cannot drift.
export const PRIORITY_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
] as const;

export interface MemberOption {
  id: string;
  full_name: string;
}

export interface ProjectFile {
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
}

export interface CompletionMap {
  [projectId: string]: { done: number; total: number };
}

// One row of v_project_progress. The database does the arithmetic, so no
// screen aggregates tasks itself and every surface shows the same number.
export interface ProgressRow {
  project_id: string;
  direct_done: number;
  direct_total: number;
  child_count: number;
  rollup_done: number;
  rollup_total: number;
}

// Rings and bars show the rolled-up figure, so a parent reflects the work
// happening in its sub-projects. For a leaf the rollup equals its own tasks.
export function completionFrom(rows: unknown): CompletionMap {
  const map: CompletionMap = {};
  for (const r of (rows ?? []) as ProgressRow[]) {
    map[r.project_id] = { done: r.rollup_done, total: r.rollup_total };
  }
  return map;
}

export const BOARD_COLUMNS: { status: ProjectStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In progress" },
  { status: "review", label: "Review" },
  { status: "delivered", label: "Delivered" },
];

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] =
  [
    { value: "backlog", label: "Backlog" },
    { value: "in_progress", label: "In progress" },
    { value: "review", label: "Review" },
    { value: "delivered", label: "Delivered" },
    { value: "archived", label: "Archived" },
  ];

// Which custom fields apply to a project: the workspace-wide ones plus any
// scoped to its space, in sort order. A plain module so the server page and
// the client editor cannot disagree about the answer.
export function fieldsForSpace(
  fields: ProjectField[],
  departmentId: string | null
): ProjectField[] {
  return fields
    .filter((f) => f.department_id === null || f.department_id === departmentId)
    .sort((a, b) => a.sort_order - b.sort_order);
}
