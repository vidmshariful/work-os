"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toggleDeliverable } from "@/lib/actions/projects";
import type { Deliverable } from "@/lib/types";

// One row of the deliverables checklist. The checkbox is live for leads and
// managers, read-only for everyone else.
export function DeliverableToggle({
  ws,
  projectId,
  deliverable,
  canToggle,
}: {
  ws: string;
  projectId: string;
  deliverable: Deliverable;
  canToggle: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(
    deliverable.is_done
  );

  const onCheckedChange = (checked: boolean | "indeterminate") => {
    const next = checked === true;
    startTransition(async () => {
      setOptimisticDone(next);
      const res = await toggleDeliverable(ws, projectId, deliverable.id, next);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <label
      className={cn(
        "flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0",
        canToggle ? "cursor-pointer hover:bg-surface-2" : "cursor-default"
      )}
    >
      <Checkbox
        checked={optimisticDone}
        onCheckedChange={onCheckedChange}
        disabled={!canToggle || pending}
        aria-label={deliverable.title}
      />
      <span
        className={cn(
          "flex-1 text-sm",
          optimisticDone ? "text-text-3 line-through" : "text-text-1"
        )}
      >
        {deliverable.title}
      </span>
      {deliverable.due_date ? (
        <span className="font-mono text-[12px] text-text-3 tabular">
          {fmtDate(deliverable.due_date)}
        </span>
      ) : null}
    </label>
  );
}
