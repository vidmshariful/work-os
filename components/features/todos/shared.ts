import type {
  PersonalTodo,
  TodoChecklistItem,
  TodoLabel,
} from "@/lib/types";

// A to-do with its labels and checklist resolved, as the page loads them.
export interface TodoDetail extends PersonalTodo {
  labels: TodoLabel[];
  checklist: TodoChecklistItem[];
}

// Wall amber is reserved, so it is deliberately absent from this palette.
export const PALETTE = [
  "#3B6FF6",
  "#7C5CFC",
  "#16A34A",
  "#E5486D",
  "#12A8A0",
  "#8A94A3",
];

export const PRIORITY_META: Record<
  number,
  { label: string; tone: string; dot: string }
> = {
  0: { label: "Normal", tone: "text-text-3", dot: "#9AA1AC" },
  1: { label: "High", tone: "text-[#7C5CFC]", dot: "#7C5CFC" },
  2: { label: "Urgent", tone: "text-danger", dot: "#E5486D" },
};

export const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";
