"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DUE_TONE_CLASS, dueState } from "./due-date";
import type { ProjectStatus } from "@/lib/types";

// "18 days late" is counted from today, and the server's today is not
// necessarily the reader's: a host in UTC and a studio in Dhaka disagree for
// six hours of every day, and either side can tick past midnight between the
// render and the hydration. React answers a mismatch here by throwing away
// the whole tree and rebuilding it, which is the intermittent failure that
// has turned up on the task list and the space lists.
//
// So the element says it may differ, and one state flip after mount re-runs
// it against the reader's own clock. The same contract TimeAgo uses.
//
// dueState itself is unchanged and still pure, because the server also calls
// it to filter and sort, where no hydration is involved.
export function DueDate({
  due,
  status,
  className,
}: {
  due: string | null | undefined;
  status: ProjectStatus;
  className?: string;
}) {
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const state = dueState(due, status);
  if (!state) return null;
  return (
    <span
      suppressHydrationWarning
      className={cn("text-[12px]", DUE_TONE_CLASS[state.tone], className)}
      title={due ? fmtDate(due) : undefined}
    >
      {state.label}
    </span>
  );
}
