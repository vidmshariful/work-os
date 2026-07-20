"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addComment,
  logRevision,
  addDependency,
  removeDependency,
  updateTask,
  setTaskDescription,
  deleteTask,
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

// Inline title editing for leads and up. Click the heading to edit, Enter or
// blur to save, Escape to abandon. For everyone else it is a plain heading.
export function EditableTitle({
  ws,
  taskId,
  title,
  canEdit,
}: {
  ws: string;
  taskId: string;
  title: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-text-1">
        {title}
      </h1>
    );
  }

  const save = () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === title) {
      setValue(title);
      return;
    }
    startTransition(async () => {
      const res = await updateTask(ws, taskId, { title: next });
      if (res.error) {
        toast.error(res.error);
        setValue(title);
      }
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        aria-label="Task title"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
        }}
        className="mt-1.5 w-full rounded-[9px] border border-border bg-surface px-2 py-1 text-[26px] font-semibold tracking-tight text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
      />
    );
  }

  return (
    <h1
      onClick={() => setEditing(true)}
      className="group mt-1.5 flex cursor-text items-center gap-2 text-[26px] font-semibold tracking-tight text-text-1"
    >
      {title}
      <Pencil
        className="size-4 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={1.5}
      />
    </h1>
  );
}

// The description as an autosaving textarea for the assignee and for leads.
// Saves when focus leaves the field. Read-only for everyone else.
export function EditableDescription({
  ws,
  taskId,
  description,
  canEdit,
}: {
  ws: string;
  taskId: string;
  description: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(description ?? "");
  const saved = useRef(description ?? "");
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return description ? (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-1">
        {description}
      </p>
    ) : (
      <p className="text-[13px] text-text-3">No description.</p>
    );
  }

  const save = () => {
    if (value === saved.current) return;
    const next = value;
    saved.current = next;
    startTransition(async () => {
      const res = await setTaskDescription(ws, taskId, next);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <textarea
      value={value}
      aria-label="Task description"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      rows={4}
      disabled={pending}
      placeholder="Add a description. It saves when you click away."
      className={`${inputClass} min-h-[84px] resize-y leading-relaxed`}
    />
  );
}

// Move a task between phases from the detail rail. Leads and up only.
export function PhaseSelect({
  ws,
  taskId,
  phaseId,
  phases,
}: {
  ws: string;
  taskId: string;
  phaseId: string | null;
  phases: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Task phase"
      className="h-8 max-w-[160px] rounded-[9px] border border-border bg-surface px-2 text-[12.5px] text-text-1 outline-none focus-visible:border-brand"
      value={phaseId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await updateTask(ws, taskId, {
            phase_id: e.target.value || null,
          });
          if (res.error) toast.error(res.error);
        })
      }
    >
      <option value="">No phase</option>
      {phases.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// Delete a task, with a confirm step. Children cascade at the database level.
export function DeleteTaskButton({
  ws,
  taskId,
  projectId,
}: {
  ws: string;
  taskId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onDelete = () =>
    startTransition(async () => {
      const res = await deleteTask(ws, taskId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Task deleted.");
      router.push(`/${ws}/projects/${projectId}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete task"
          className="text-text-3 hover:text-danger"
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this task?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-2">
          This removes the task along with its comments, revisions, and
          dependencies. It cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={pending}>
            {pending ? "Deleting" : "Delete task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
