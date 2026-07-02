"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTaskStatus } from "@/lib/actions/tasks";
import type { TaskStatus } from "@/lib/types";

const OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

// Quick status control. Contributors may move their own tasks, leads any
// task. RLS and the contributor guard trigger enforce both.
export function TaskStatusSelect({
  ws,
  taskId,
  status,
}: {
  ws: string;
  taskId: string;
  status: TaskStatus;
}) {
  const [value, setValue] = useState<TaskStatus>(status);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(status);
  }, [status]);

  function handleChange(next: string) {
    const nextStatus = next as TaskStatus;
    if (nextStatus === value) return;
    const previous = value;
    setValue(nextStatus);
    startTransition(async () => {
      const result = await updateTaskStatus(ws, taskId, nextStatus);
      if (result.error) {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label="Change status"
        className="w-[126px] text-[12.5px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
