import type { ProjectStatus } from "@/lib/types";

// Project status → dot color, matching the status-chip palette in the design
// system (Review amber is the status mapping, not the wall marker).
export const STATUS_DOT: Record<ProjectStatus, string> = {
  backlog: "#8a94a3",
  in_progress: "#3b6ff6",
  review: "#c77a15",
  delivered: "#16a34a",
  archived: "#9aa1ac",
};
