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

const TONES: Record<TagTone, { bg: string; dot: string; text: string }> = {
  blue: { bg: "bg-tag-blue-soft", dot: "bg-tag-blue", text: "text-[#2554d6]" },
  violet: { bg: "bg-tag-violet-soft", dot: "bg-tag-violet", text: "text-[#5f41d9]" },
  green: { bg: "bg-tag-green-soft", dot: "bg-tag-green", text: "text-[#12813b]" },
  amber: { bg: "bg-tag-amber-soft", dot: "bg-tag-amber", text: "text-[#9c5f0e]" },
  rose: { bg: "bg-tag-rose-soft", dot: "bg-tag-rose", text: "text-[#c92e55]" },
  teal: { bg: "bg-tag-teal-soft", dot: "bg-tag-teal", text: "text-[#0d827c]" },
  gray: { bg: "bg-tag-gray-soft", dot: "bg-tag-gray", text: "text-[#5d6675]" },
};

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
