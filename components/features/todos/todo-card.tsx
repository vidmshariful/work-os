"use client";

import { CalendarDays, ListChecks, StickyNote } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { PRIORITY_META, type TodoDetail } from "./shared";

export function TodoCard({
  todo,
  onToggle,
  onOpen,
}: {
  todo: TodoDetail;
  onToggle: (id: string, isDone: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const done = todo.is_done;
  const total = todo.checklist.length;
  const checked = todo.checklist.filter((c) => c.is_done).length;
  const prio = PRIORITY_META[todo.priority] ?? PRIORITY_META[0];
  const hasMeta =
    todo.priority > 0 ||
    todo.due_date ||
    total > 0 ||
    todo.notes ||
    todo.labels.length > 0;

  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-surface p-2.5 transition-colors hover:border-border-strong",
        done && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={done}
            aria-label={`Mark ${todo.title} done`}
            onCheckedChange={(c) => onToggle(todo.id, c === true)}
          />
        </span>
        <button onClick={() => onOpen(todo.id)} className="min-w-0 flex-1 text-left">
          <span
            className={cn(
              "block text-body font-medium leading-snug",
              done ? "text-text-3 line-through" : "text-text-1"
            )}
          >
            {todo.title}
          </span>
          {hasMeta ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {todo.priority > 0 ? (
                <span className={cn("inline-flex items-center gap-1 text-label font-medium", prio.tone)}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: prio.dot }} />
                  {prio.label}
                </span>
              ) : null}
              {todo.due_date ? (
                <span className="inline-flex items-center gap-1 text-label text-text-2">
                  <CalendarDays className="size-3.5" strokeWidth={1.5} />
                  <span className="font-mono tabular">{fmtDate(todo.due_date)}</span>
                </span>
              ) : null}
              {total > 0 ? (
                <span className="inline-flex items-center gap-1 text-label text-text-3">
                  <ListChecks className="size-3.5" strokeWidth={1.5} />
                  <span className="font-mono tabular">
                    {checked}/{total}
                  </span>
                </span>
              ) : null}
              {todo.notes ? (
                <StickyNote className="size-3.5 text-text-3" strokeWidth={1.5} />
              ) : null}
              {todo.labels.map((l) => (
                <span
                  key={l.id}
                  className="rounded-full px-1.5 py-0.5 text-micro font-medium"
                  style={{ backgroundColor: `${l.color}22`, color: l.color }}
                >
                  {l.name}
                </span>
              ))}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
