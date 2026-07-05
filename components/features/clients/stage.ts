import type { ClientStage } from "@/lib/types";
import type { TagTone } from "@/components/primitives/tag";

// The relationship pipeline, in board order. Onboard: paid and being set
// up. Active: work running. Blocked: on hold. Black list: never again.
// Done: delivered, returns to Active on a reorder.
export const STAGE_ORDER: ClientStage[] = [
  "onboard",
  "active",
  "blocked",
  "blacklist",
  "done",
];

export const STAGE_META: Record<
  ClientStage,
  { label: string; tone: TagTone; hint: string }
> = {
  onboard: { label: "Onboard", tone: "blue", hint: "Paid, being set up" },
  active: { label: "Active", tone: "green", hint: "Project running" },
  blocked: { label: "Blocked", tone: "amber", hint: "On hold" },
  blacklist: { label: "Black list", tone: "rose", hint: "No future work" },
  done: { label: "Done", tone: "gray", hint: "Delivered" },
};
