import { cn } from "@/lib/utils";
import type {
  TaskStatus,
  ProjectStatus,
  ClientStage,
  LeaveStatus,
} from "@/lib/types";

export type TagTone =
  | "blue"
  | "violet"
  | "green"
  | "amber"
  | "rose"
  | "teal"
  | "gray";

// Three values per tone, not two: the fill, the dot, and the label. The
// label is its own token because it has to move in the opposite direction
// from the fill between themes. On light it is darker than the dot so it
// reads on a pastel background; on dark it is lighter, for the same reason.
// These were hardcoded hex, which is what would have made every chip
// unreadable the moment a dark canvas appeared.
const TONES: Record<TagTone, { bg: string; dot: string; text: string }> = {
  blue: { bg: "bg-tag-blue-soft", dot: "bg-tag-blue", text: "text-tag-blue-text" },
  violet: { bg: "bg-tag-violet-soft", dot: "bg-tag-violet", text: "text-tag-violet-text" },
  green: { bg: "bg-tag-green-soft", dot: "bg-tag-green", text: "text-tag-green-text" },
  amber: { bg: "bg-tag-amber-soft", dot: "bg-tag-amber", text: "text-tag-amber-text" },
  rose: { bg: "bg-tag-rose-soft", dot: "bg-tag-rose", text: "text-tag-rose-text" },
  teal: { bg: "bg-tag-teal-soft", dot: "bg-tag-teal", text: "text-tag-teal-text" },
  gray: { bg: "bg-tag-gray-soft", dot: "bg-tag-gray", text: "text-tag-gray-text" },
};

// The palette in picker order. project_lists.color is constrained to exactly
// these seven in Postgres, so a colour chosen here always has a token.
export const TAG_TONES: TagTone[] = [
  "blue",
  "violet",
  "green",
  "amber",
  "rose",
  "teal",
  "gray",
];

// The saturated fill for a tone, for callers that want the dot without the
// pill around it. Reads from the same table the pill does, so the two can
// never drift.
export function toneDotClass(tone: TagTone): string {
  return TONES[tone].dot;
}

export function isTagTone(value: unknown): value is TagTone {
  return typeof value === "string" && value in TONES;
}

// Pill tag: soft pastel background plus a saturated dot. Department, status,
// people.
export function Tag({
  tone = "gray",
  children,
  className,
  dot = true,
}: {
  tone?: TagTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] px-2 py-0.5 text-[12px] font-medium",
        t.bg,
        t.text,
        className
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", t.dot)} /> : null}
      {children}
    </span>
  );
}

const TASK_STATUS: Record<TaskStatus, { tone: TagTone; label: string }> = {
  backlog: { tone: "gray", label: "Backlog" },
  todo: { tone: "blue", label: "Todo" },
  in_progress: { tone: "blue", label: "In progress" },
  review: { tone: "amber", label: "Review" },
  done: { tone: "green", label: "Done" },
  blocked: { tone: "rose", label: "Blocked" },
};

const PROJECT_STATUS: Record<ProjectStatus, { tone: TagTone; label: string }> = {
  backlog: { tone: "gray", label: "Backlog" },
  in_progress: { tone: "blue", label: "In progress" },
  review: { tone: "amber", label: "Review" },
  delivered: { tone: "green", label: "Delivered" },
  archived: { tone: "gray", label: "Archived" },
};

export const CLIENT_STAGES: Record<ClientStage, { tone: TagTone; label: string }> = {
  onboard: { tone: "blue", label: "Onboard" },
  active: { tone: "green", label: "Active" },
  blocked: { tone: "amber", label: "Blocked" },
  blacklist: { tone: "rose", label: "Black list" },
  done: { tone: "gray", label: "Done" },
};

const LEAVE_STATUS: Record<LeaveStatus, { tone: TagTone; label: string }> = {
  pending: { tone: "amber", label: "Pending" },
  approved: { tone: "green", label: "Approved" },
  rejected: { tone: "rose", label: "Rejected" },
  cancelled: { tone: "gray", label: "Cancelled" },
};

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

export function ClientStageChip({ stage }: { stage: ClientStage }) {
  const s = CLIENT_STAGES[stage];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

export function LeaveStatusChip({ status }: { status: LeaveStatus }) {
  const s = LEAVE_STATUS[status];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

// Above-wall confidential marker. Amber is reserved for this and appears
// only on above-wall screens.
export function ConfidentialChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-wall-soft px-2 py-0.5 text-[12px] font-medium text-wall">
      <span className="size-1.5 rounded-full bg-wall" />
      Confidential
    </span>
  );
}
