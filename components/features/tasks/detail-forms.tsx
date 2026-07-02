"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addComment,
  logRevision,
  addDependency,
  removeDependency,
  updateTask,
  type TaskActionState,
} from "@/lib/actions/tasks";

const initialState: TaskActionState = { error: null };

const inputClass =
  "w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function CommentForm({ ws, taskId }: { ws: string; taskId: string }) {
  const [state, formAction, pending] = useActionState(addComment, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="task_id" value={taskId} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Write a comment"
        className={inputClass}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Posting" : "Comment"}
        </Button>
      </div>
    </form>
  );
}

export function RevisionForm({ ws, taskId }: { ws: string; taskId: string }) {
  const [state, formAction, pending] = useActionState(logRevision, initialState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Log revision
      </Button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="task_id" value={taskId} />
      <textarea
        name="note"
        rows={2}
        required
        autoFocus
        placeholder="What needs revising"
        className={inputClass}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Logging" : "Log revision"}
        </Button>
      </div>
    </form>
  );
}

export function DependencyManager({
  ws,
  taskId,
  candidates,
  existing,
}: {
  ws: string;
  taskId: string;
  candidates: { id: string; title: string }[];
  existing: string[];
}) {
  const [pending, startTransition] = useTransition();
  const available = candidates.filter((c) => !existing.includes(c.id));

  const onAdd = (dependsOn: string) => {
    if (!dependsOn) return;
    startTransition(async () => {
      const res = await addDependency(ws, taskId, dependsOn);
      if (res.error) toast.error(res.error);
    });
  };

  if (available.length === 0) return null;

  return (
    <select
      aria-label="Add dependency"
      className="h-8 w-full rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-text-2 outline-none focus-visible:border-brand"
      value=""
      disabled={pending}
      onChange={(e) => onAdd(e.target.value)}
    >
      <option value="">Add a dependency</option>
      {available.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

export function RemoveDependencyButton({
  ws,
  taskId,
  dependsOnTaskId,
}: {
  ws: string;
  taskId: string;
  dependsOnTaskId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      aria-label="Remove dependency"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await removeDependency(ws, taskId, dependsOnTaskId);
          if (res.error) toast.error(res.error);
        })
      }
      className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
    >
      <X className="size-3.5" strokeWidth={1.5} />
    </button>
  );
}

export function AssigneeSelect({
  ws,
  taskId,
  assigneeId,
  members,
}: {
  ws: string;
  taskId: string;
  assigneeId: string | null;
  members: { id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Reassign task"
      className="h-8 max-w-[160px] rounded-[9px] border border-border bg-surface px-2 text-[12.5px] text-text-1 outline-none focus-visible:border-brand"
      value={assigneeId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await updateTask(ws, taskId, {
            assignee_id: e.target.value || null,
          });
          if (res.error) toast.error(res.error);
        })
      }
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name}
        </option>
      ))}
    </select>
  );
}
