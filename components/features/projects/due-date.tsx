import { daysUntil, fmtDate } from "@/lib/format";
import type { ProjectStatus } from "@/lib/types";

// A shipped project is not late. Only Delivered ends the clock; Review stays
// eligible because work sitting in review past its date is exactly the
// lateness worth surfacing. Archived is here because an archived project is
// out of play, not because it was finished on time.
export const TERMINAL_STATUSES: ProjectStatus[] = ["delivered", "archived"];

export type DueTone = "overdue" | "soon" | "neutral";

export interface DueState {
  tone: DueTone;
  label: string;
  days: number;
}

// The single decision about how a due date reads. Every row, card, and rail
// calls this, so lateness cannot mean one thing on the board and another in
// a list. Returns null when there is no date, and callers render nothing:
// an absent date is absent, never the words "No date".
export function dueState(
  due: string | null | undefined,
  status: ProjectStatus
): DueState | null {
  if (!due) return null;
  const days = daysUntil(due);
  if (days === null) return null;

  if (TERMINAL_STATUSES.includes(status)) {
    return { tone: "neutral", label: fmtDate(due), days };
  }
  if (days < 0) {
    const late = Math.abs(days);
    return { tone: "overdue", label: `${late} day${late === 1 ? "" : "s"} late`, days };
  }
  if (days === 0) return { tone: "soon", label: "Today", days };
  if (days === 1) return { tone: "soon", label: "Tomorrow", days };
  if (days <= 3) return { tone: "soon", label: `In ${days} days`, days };
  return { tone: "neutral", label: fmtDate(due), days };
}

// Convenience for the places that only need the yes or no, such as the
// overdue pill and its filter.
export function isOverdue(
  due: string | null | undefined,
  status: ProjectStatus
): boolean {
  return dueState(due, status)?.tone === "overdue";
}

// An absolute date keeps the mono tabular treatment so date columns still
// line up. A relative phrase is prose, so it is not forced into mono.
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "font-medium text-danger",
  soon: "font-medium text-warning",
  neutral: "font-mono text-text-2 tabular",
};

// The component lives in its own client module. This file must stay a plain
// module, because the space page and the filters call dueState and isOverdue
// during a server render, and a "use client" file cannot be called from one.
export { DueDate } from "./due-date-live";
