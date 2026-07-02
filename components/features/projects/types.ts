// Shared shapes for the projects feature. Supabase nested selects type
// loosely, so pages cast query results into these.
import type { Project, ProjectStatus, Task } from "@/lib/types";

export interface OwnerRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export type ProjectWithOwner = Project & { owner: OwnerRef | null };

export type TaskWithAssignee = Task & { assignee: OwnerRef | null };

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
