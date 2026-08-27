"use client";

import { useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "@/components/primitives/avatar";
import { setProjectAssignee } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";

export interface PersonRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

// Who is on this project. Two kinds of person appear here and they are not
// the same thing, so the row says which is which: somebody put on the project
// deliberately, and somebody who simply holds a task in it. Only the first
// kind can be added or removed, because the second is a fact about the tasks
// and the place to change it is the task.
export function ProjectPeople({
  ws,
  projectId,
  assigned,
  onTasks,
  members,
  canEdit,
}: {
  ws: string;
  projectId: string;
  assigned: PersonRef[];
  onTasks: PersonRef[];
  members: { id: string; full_name: string }[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const assignedIds = new Set(assigned.map((a) => a.id));
  // Somebody who is both is shown once, as assigned, since that is the
  // stronger statement and it is the one that can be removed.
  const taskOnly = onTasks.filter((p) => !assignedIds.has(p.id));

  const toggle = (profileId: string, on: boolean) =>
    start(async () => {
      const res = await setProjectAssignee(ws, projectId, profileId, on);
      if (res.error) toast.error(res.error);
    });

  if (assigned.length === 0 && taskOnly.length === 0 && !canEdit) {
    return <span className="px-2 text-body text-text-3">Nobody assigned yet</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-0.5">
      {assigned.map((a) => (
        <span
          key={a.id}
          className="group/person flex items-center gap-1.5 rounded-[8px] bg-surface-2 py-0.5 pl-0.5 pr-1.5 text-meta text-text-1"
        >
          <PersonAvatar name={a.full_name} src={a.avatar_url} size={20} />
          {a.full_name}
          {canEdit ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(a.id, false)}
              aria-label={`Remove ${a.full_name} from this project`}
              className="rounded-[5px] p-0.5 text-text-3 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover/person:opacity-100"
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : null}
        </span>
      ))}

      {taskOnly.map((p) => (
        <span
          key={p.id}
          title={`${p.full_name} holds a task here`}
          className="flex items-center gap-1.5 text-meta text-text-2"
        >
          <PersonAvatar name={p.full_name} src={p.avatar_url} size={20} />
          {p.full_name}
          <span className="text-label text-text-3">on tasks</span>
        </span>
      ))}

      {assigned.length === 0 && taskOnly.length === 0 ? (
        <span className="text-body text-text-3">Nobody assigned yet</span>
      ) : null}

      {canEdit ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className="flex items-center gap-1 rounded-[8px] border border-dashed border-border px-1.5 py-1 text-meta text-text-2 transition-colors hover:border-brand hover:text-text-1"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              Add
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-60 overflow-y-auto p-1">
            {members.length === 0 ? (
              <p className="px-2 py-3 text-center text-meta text-text-3">
                Nobody to add.
              </p>
            ) : (
              members.map((m) => {
                const on = assignedIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(m.id, !on)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-body transition-colors hover:bg-surface-2",
                      on ? "font-medium text-text-1" : "text-text-2"
                    )}
                  >
                    <span className="w-4">
                      {on ? <Check className="size-3.5 text-brand" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{m.full_name}</span>
                  </button>
                );
              })
            )}
            <p className="border-t border-border px-2 pb-1 pt-2 text-label text-text-3">
              Anyone here can open this project, whichever space they work in.
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
}
