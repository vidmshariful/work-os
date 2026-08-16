import { Tag } from "@/components/primitives/tag";
import { fmtDate, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

// Small server-safe pieces shared across the tasks surfaces.

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

// Column order on the team board, per the design system status mapping.
export const BOARD_STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
];

// Grouping order on My tasks: active work first, done last.
export const MY_TASKS_STATUS_ORDER: TaskStatus[] = [
  "in_progress",
  "review",
  "todo",
  "blocked",
  "backlog",
  "done",
];

export const PRIORITY_LABELS = ["Normal", "High", "Urgent"];

export function PriorityTag({ priority }: { priority: number }) {
  if (priority === 2) return <Tag tone="rose">Urgent</Tag>;
  if (priority === 1) return <Tag tone="violet">High</Tag>;
  return <Tag tone="gray">Normal</Tag>;
}

export function isOverdue(date: string | null, status: TaskStatus) {
  if (!date || status === "done") return false;
  const days = daysUntil(date);
  return days !== null && days < 0;
}

export function DueDateLabel({
  date,
  status,
  className,
}: {
  date: string | null;
  status: TaskStatus;
  className?: string;
}) {
  if (!date) return null;
  return (
    <span
      className={cn(
        "font-mono text-meta tabular",
        isOverdue(date, status) ? "font-medium text-danger" : "text-text-2",
        className
      )}
    >
      {fmtDate(date)}
    </span>
  );
}

export function RevisionHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="font-mono text-label text-text-3 tabular">
      x{count} rev
    </span>
  );
}
