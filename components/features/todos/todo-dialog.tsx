"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/primitives/field";
import {
  addChecklistItem,
  createLabel,
  deleteChecklistItem,
  deleteTodo,
  setTodoLabel,
  toggleChecklistItem,
  updateTodo,
} from "@/lib/actions/todos";
import type { TodoLabel, TodoStage } from "@/lib/types";
import { PALETTE, inputClass, type TodoDetail } from "./shared";

export function TodoDialog({
  ws,
  todo,
  stages,
  labels,
  open,
  onOpenChange,
}: {
  ws: string;
  todo: TodoDetail | null;
  stages: TodoStage[];
  labels: TodoLabel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {todo ? (
          <Body
            ws={ws}
            todo={todo}
            stages={stages}
            labels={labels}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  ws,
  todo,
  stages,
  labels,
  onClose,
}: {
  ws: string;
  todo: TodoDetail;
  stages: TodoStage[];
  labels: TodoLabel[];
  onClose: () => void;
}) {
  const [, start] = useTransition();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const savedTitle = useRef(todo.title);
  const savedNotes = useRef(todo.notes ?? "");
  const [step, setStep] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(PALETTE[0]);

  // Re-sync when a different to-do is opened into the same dialog.
  useEffect(() => {
    setTitle(todo.title);
    setNotes(todo.notes ?? "");
    savedTitle.current = todo.title;
    savedNotes.current = todo.notes ?? "";
  }, [todo.id, todo.title, todo.notes]);

  const patch = (p: Parameters<typeof updateTodo>[2], ok?: string) =>
    start(async () => {
      const res = await updateTodo(ws, todo.id, p);
      if (res.error) toast.error(res.error);
      else if (ok) toast.success(ok);
    });

  const saveTitle = () => {
    const v = title.trim();
    if (!v || v === savedTitle.current) {
      setTitle(savedTitle.current);
      return;
    }
    savedTitle.current = v;
    patch({ title: v });
  };
  const saveNotes = () => {
    if (notes === savedNotes.current) return;
    savedNotes.current = notes;
    patch({ notes });
  };

  const attached = new Set(todo.labels.map((l) => l.id));
  const available = labels.filter((l) => !attached.has(l.id));
  const checkedCount = todo.checklist.filter((c) => c.is_done).length;

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  const addLabelNew = () => {
    const name = newLabel.trim();
    if (!name) return;
    start(async () => {
      const res = await createLabel(ws, name, newLabelColor);
      if (res.error || !res.label) {
        toast.error(res.error ?? "Could not create the label.");
        return;
      }
      await setTodoLabel(ws, todo.id, res.label.id, true);
      setNewLabel("");
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">Edit to-do</DialogTitle>
      </DialogHeader>

      <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <input
          value={title}
          aria-label="Title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className="w-full rounded-[9px] border border-transparent bg-transparent px-1 text-[17px] font-semibold text-text-1 outline-none focus-visible:border-border focus-visible:bg-surface"
        />

        <div className="grid grid-cols-3 gap-3">
          <Field label="Stage" htmlFor="td_stage">
            <select
              id="td_stage"
              className={inputClass}
              value={todo.stage_id ?? ""}
              onChange={(e) => patch({ stage_id: e.target.value || null })}
            >
              <option value="">Inbox</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority" htmlFor="td_prio">
            <select
              id="td_prio"
              className={inputClass}
              value={todo.priority}
              onChange={(e) => patch({ priority: Number(e.target.value) })}
            >
              <option value={0}>Normal</option>
              <option value={1}>High</option>
              <option value={2}>Urgent</option>
            </select>
          </Field>
          <Field label="Due date" htmlFor="td_due">
            <input
              id="td_due"
              type="date"
              className={inputClass}
              value={todo.due_date ?? ""}
              onChange={(e) => patch({ due_date: e.target.value || null })}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="td_notes">
          <textarea
            id="td_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
            placeholder="Context, links, anything useful. Saves when you click away."
            className={`${inputClass} min-h-[72px] resize-y py-2 leading-relaxed`}
          />
        </Field>

        {/* labels */}
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-text-2">Labels</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {todo.labels.map((l) => (
              <span
                key={l.id}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                style={{ backgroundColor: `${l.color}22`, color: l.color }}
              >
                {l.name}
                <button
                  aria-label={`Remove ${l.name}`}
                  onClick={() => run(() => setTodoLabel(ws, todo.id, l.id, false))}
                  className="rounded-full hover:opacity-70"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {available.length > 0 ? (
              <select
                aria-label="Add label"
                value=""
                onChange={(e) =>
                  e.target.value &&
                  run(() => setTodoLabel(ws, todo.id, e.target.value, true))
                }
                className="h-7 rounded-[8px] border border-dashed border-border bg-surface px-2 text-[12px] text-text-2 outline-none focus-visible:border-brand"
              >
                <option value="">Add label</option>
                {available.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New label"
              className="h-7 w-32 rounded-[8px] border border-border bg-surface px-2 text-[12px] text-text-1 outline-none focus-visible:border-brand"
            />
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setNewLabelColor(c)}
                className="size-4 rounded-full ring-offset-1"
                style={{
                  backgroundColor: c,
                  outline: newLabelColor === c ? `2px solid ${c}` : "none",
                }}
              />
            ))}
            <Button type="button" size="xs" variant="outline" onClick={addLabelNew} disabled={!newLabel.trim()}>
              Add
            </Button>
          </div>
        </div>

        {/* checklist */}
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-text-2">
            Checklist{" "}
            {todo.checklist.length > 0 ? (
              <span className="font-mono text-[11.5px] text-text-3 tabular">
                {checkedCount}/{todo.checklist.length}
              </span>
            ) : null}
          </span>
          <div className="flex flex-col">
            {todo.checklist.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 py-1">
                <Checkbox
                  checked={c.is_done}
                  aria-label={c.title}
                  onCheckedChange={(v) =>
                    run(() => toggleChecklistItem(ws, c.id, v === true))
                  }
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    c.is_done ? "text-text-3 line-through" : "text-text-1"
                  }`}
                >
                  {c.title}
                </span>
                <button
                  aria-label="Delete step"
                  onClick={() => run(() => deleteChecklistItem(ws, c.id))}
                  className="rounded-[6px] p-0.5 text-text-3 opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = step.trim();
              if (!v) return;
              setStep("");
              run(() => addChecklistItem(ws, todo.id, v));
            }}
            className="flex items-center gap-1.5"
          >
            <input
              value={step}
              onChange={(e) => setStep(e.target.value)}
              placeholder="Add a step"
              className="h-8 flex-1 rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none focus-visible:border-brand"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!step.trim()}>
              <Plus />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-text-3 hover:text-danger"
          onClick={() =>
            start(async () => {
              const res = await deleteTodo(ws, todo.id);
              if (res.error) toast.error(res.error);
              else onClose();
            })
          }
        >
          <Trash2 />
          Delete
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}
