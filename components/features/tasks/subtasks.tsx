"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/primitives/progress";
import { TaskStatusChip } from "@/components/primitives/tag";
import { createSubtask, updateTaskStatus } from "@/lib/actions/tasks";
import type { TaskStatus } from "@/lib/types";

export interface SubtaskRow {
  id: string;
  title: string;
  status: TaskStatus;
}

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function SubtasksCard({
  ws,
  parentId,
  subtasks,
  parentStatus,
  canManage,
}: {
  ws: string;
  parentId: string;
  subtasks: SubtaskRow[];
  parentStatus: TaskStatus;
  canManage: boolean;
}) {
  // Optimistic status overlay. The server refreshes props after each write, so
  // the overlay just keeps the checkbox instant.
  const [overlay, setOverlay] = useState<Record<string, TaskStatus>>({});
  const [title, setTitle] = useState("");
  const [adding, startAdd] = useTransition();
  const [, startToggle] = useTransition();

  const rows = subtasks.map((s) =>
    overlay[s.id] ? { ...s, status: overlay[s.id] } : s
  );
  const done = rows.filter((r) => r.status === "done").length;
  const open = rows.length - done;

  const toggle = (id: string, checked: boolean) => {
    const next: TaskStatus = checked ? "done" : "todo";
    setOverlay((o) => ({ ...o, [id]: next }));
    startToggle(async () => {
      const res = await updateTaskStatus(ws, id, next);
      if (res.error) {
        setOverlay((o) => {
          const { [id]: _drop, ...rest } = o;
          return rest;
        });
        toast.error(res.error);
      }
    });
  };

  const add = () => {
    const t = title.trim();
    if (!t) return;
    startAdd(async () => {
      const res = await createSubtask(ws, parentId, t);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setTitle("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <>
          <div className="flex items-center justify-between text-meta font-medium text-text-2">
            <span>
              {done} of {rows.length} done
            </span>
            <span className="font-mono tabular">
              {Math.round((done / rows.length) * 100)}%
            </span>
          </div>
          <ProgressBar value={rows.length > 0 ? done / rows.length : 0} />
          <div className="flex flex-col">
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
              >
                <Checkbox
                  checked={s.status === "done"}
                  aria-label={`Mark ${s.title} done`}
                  onCheckedChange={(c) => toggle(s.id, c === true)}
                />
                <Link
                  href={`/${ws}/tasks/${s.id}`}
                  className={`min-w-0 flex-1 truncate text-body hover:text-brand ${
                    s.status === "done"
                      ? "text-text-3 line-through"
                      : "text-text-1"
                  }`}
                >
                  {s.title}
                </Link>
                <TaskStatusChip status={s.status} />
              </div>
            ))}
          </div>
          {parentStatus === "done" && open > 0 ? (
            <p className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-meta text-text-2">
              This task is marked done but {open} subtask{open === 1 ? "" : "s"}{" "}
              {open === 1 ? "is" : "are"} still open.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-meta text-text-3">No subtasks yet.</p>
      )}

      {canManage ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a subtask"
            className={inputClass}
          />
          <Button type="submit" size="sm" variant="outline" disabled={adding || !title.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}
