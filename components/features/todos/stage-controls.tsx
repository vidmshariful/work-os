"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createStage,
  createTodo,
  deleteStage,
  renameStage,
  reorderStage,
  setDefaultStage,
  setDoneStage,
  type TodoState,
} from "@/lib/actions/todos";
import { PALETTE } from "./shared";

const initialState: TodoState = { error: null };

function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className="size-5 rounded-full"
          style={{
            backgroundColor: c,
            outline: value === c ? `2px solid ${c}` : "none",
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}

// Inline quick-add for a column or list group. stageId "" means Inbox.
export function AddTodo({ ws, stageId }: { ws: string; stageId: string }) {
  const [state, formAction] = useActionState(createTodo, initialState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="px-1">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="stage_id" value={stageId} />
      <input
        name="title"
        placeholder="Add a to-do"
        autoComplete="off"
        className="h-8 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-[13px] text-text-1 outline-none placeholder:text-text-3 hover:border-border focus-visible:border-brand focus-visible:bg-surface"
      />
    </form>
  );
}

export function NewStage({ ws }: { ws: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [pending, start] = useTransition();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const res = await createStage(ws, n, color);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          New stage
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stage name"
            className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand"
          />
          <Swatches value={color} onChange={setColor} />
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>
            Add stage
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function StageEditor({
  ws,
  id,
  name,
  color,
  isDefault,
  isDone,
  canLeft,
  canRight,
}: {
  ws: string;
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isDone: boolean;
  canLeft: boolean;
  canRight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [c, setC] = useState(color);
  const [pending, start] = useTransition();

  useEffect(() => {
    setValue(name);
    setC(color);
  }, [name, color]);

  const run = (fn: () => Promise<{ error: string | null }>, close = false) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (close) setOpen(false);
    });

  const save = () => {
    const v = value.trim();
    if (!v) return;
    run(() => renameStage(ws, id, v, c), true);
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-[7px] border px-2 py-1 text-[12px] font-medium transition-colors",
      active
        ? "border-brand bg-brand-soft text-brand"
        : "border-border text-text-2 hover:text-text-1"
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Stage options"
          className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-text-1 group-hover/col:opacity-100"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex flex-col gap-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand"
          />
          <Swatches value={c} onChange={setC} />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={chip(isDefault)}
              disabled={pending}
              onClick={() => run(() => setDefaultStage(ws, id))}
            >
              Default
            </button>
            <button
              type="button"
              className={chip(isDone)}
              disabled={pending}
              onClick={() => run(() => setDoneStage(ws, id))}
            >
              Done column
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move earlier"
                disabled={!canLeft || pending}
                onClick={() => run(() => reorderStage(ws, id, "up"))}
              >
                <ArrowLeft className="size-4" strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move later"
                disabled={!canRight || pending}
                onClick={() => run(() => reorderStage(ws, id, "down"))}
              >
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-text-3 hover:text-danger"
                disabled={pending}
                onClick={() => run(() => deleteStage(ws, id), true)}
              >
                <Trash2 />
              </Button>
              <Button size="sm" disabled={pending} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
