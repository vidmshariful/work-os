"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CircleCheckBig } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/primitives/misc";
import { toggleTodo, updateTodo } from "@/lib/actions/todos";
import type { TodoLabel, TodoStage } from "@/lib/types";
import { type TodoDetail } from "./shared";
import { TodoCard } from "./todo-card";
import { TodoDialog } from "./todo-dialog";
import { AddTodo, NewStage, StageEditor } from "./stage-controls";

function seg(active: boolean) {
  return cn(
    "rounded-[7px] px-3 py-1 text-body font-medium transition-colors",
    active ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
  );
}

function Header({
  ws,
  stage,
  count,
  index,
  total,
}: {
  ws: string;
  stage: TodoStage;
  count: number;
  index: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
      <span className="truncate text-meta font-semibold text-text-1">{stage.name}</span>
      {stage.is_done ? (
        <CircleCheckBig className="size-3.5 text-success" strokeWidth={1.75} />
      ) : null}
      <CountBadge count={count} className="ml-0" />
      <span className="ml-auto">
        <StageEditor
          ws={ws}
          id={stage.id}
          name={stage.name}
          color={stage.color}
          isDefault={stage.is_default}
          isDone={stage.is_done}
          canLeft={index > 0}
          canRight={index < total - 1}
        />
      </span>
    </div>
  );
}

function DraggableCard({
  todo,
  onToggle,
  onOpen,
}: {
  todo: TodoDetail;
  onToggle: (id: string, isDone: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: todo.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn("touch-none outline-none", isDragging && "opacity-40")}
    >
      <TodoCard todo={todo} onToggle={onToggle} onOpen={onOpen} />
    </div>
  );
}

function Droppable({
  stageId,
  className,
  children,
}: {
  stageId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "bg-surface-2 ring-1 ring-border-strong")}
    >
      {children}
    </div>
  );
}

export function TodosWorkspace({
  ws,
  view,
  stages,
  todos,
  labels,
}: {
  ws: string;
  view: "list" | "board";
  stages: TodoStage[];
  todos: TodoDetail[];
  labels: TodoLabel[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doneOverlay, setDoneOverlay] = useState<Record<string, boolean>>({});
  const [stageOverlay, setStageOverlay] = useState<Record<string, string | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const stageIds = new Set(stages.map((s) => s.id));
  const defaultStageId =
    stages.find((s) => s.is_default)?.id ?? stages[0]?.id ?? null;
  const doneStageId = stages.find((s) => s.is_done)?.id ?? null;

  const rows: TodoDetail[] = todos.map((t) => ({
    ...t,
    is_done: t.id in doneOverlay ? doneOverlay[t.id] : t.is_done,
    stage_id: t.id in stageOverlay ? stageOverlay[t.id] : t.stage_id,
  }));
  const selected = rows.find((t) => t.id === selectedId) ?? null;
  const active = rows.find((t) => t.id === activeId) ?? null;

  // A to-do whose stage was deleted or never set shows in the default column.
  const effectiveStage = (t: TodoDetail) =>
    t.stage_id && stageIds.has(t.stage_id) ? t.stage_id : defaultStageId;

  const byColumn = (stageId: string) =>
    rows
      .filter((t) => effectiveStage(t) === stageId)
      .sort(
        (a, b) =>
          Number(a.is_done) - Number(b.is_done) ||
          b.priority - a.priority ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
      );

  const onToggle = (id: string, isDone: boolean) => {
    setDoneOverlay((o) => ({ ...o, [id]: isDone }));
    const target = isDone ? doneStageId : defaultStageId;
    if (target) setStageOverlay((o) => ({ ...o, [id]: target }));
    start(async () => {
      const r = await toggleTodo(ws, id, isDone);
      if (r.error) {
        setDoneOverlay((o) => {
          const { [id]: _d, ...rest } = o;
          return rest;
        });
        setStageOverlay((o) => {
          const { [id]: _s, ...rest } = o;
          return rest;
        });
        toast.error(r.error);
      }
    });
  };

  const onMove = (id: string, stageId: string) => {
    setStageOverlay((o) => ({ ...o, [id]: stageId }));
    const targetDone = stages.find((s) => s.id === stageId)?.is_done ?? false;
    setDoneOverlay((o) => ({ ...o, [id]: targetDone }));
    start(async () => {
      const r = await updateTodo(ws, id, { stage_id: stageId });
      if (r.error) {
        setStageOverlay((o) => {
          const { [id]: _s, ...rest } = o;
          return rest;
        });
        setDoneOverlay((o) => {
          const { [id]: _d, ...rest } = o;
          return rest;
        });
        toast.error(r.error);
      }
    });
  };

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const todo = rows.find((t) => t.id === a.id);
    const next = over.id as string;
    if (!todo || !stageIds.has(next) || effectiveStage(todo) === next) return;
    onMove(todo.id, next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            My to-dos
          </h1>
          <p className="page-subtitle mt-1">
            Your personal board. Only you can see this.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
            <Link href={`/${ws}/todos`} className={seg(view === "list")}>
              List
            </Link>
            <Link href={`/${ws}/todos?view=board`} className={seg(view === "board")}>
              Board
            </Link>
          </div>
          <NewStage ws={ws} />
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border px-6 py-10 text-center text-body text-text-3">
          Add a stage to start organizing your work.
        </div>
      ) : view === "board" ? (
        <DndContext
          id="todos-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {stages.map((stage, i) => {
              const items = byColumn(stage.id);
              return (
                <div key={stage.id} className="group/col flex w-[264px] shrink-0 flex-col gap-2">
                  <Header ws={ws} stage={stage} count={items.length} index={i} total={stages.length} />
                  <Droppable
                    stageId={stage.id}
                    className="flex min-h-[56px] flex-col gap-2 rounded-[12px] p-1 transition-colors"
                  >
                    {items.map((t) => (
                      <DraggableCard key={t.id} todo={t} onToggle={onToggle} onOpen={setSelectedId} />
                    ))}
                  </Droppable>
                  <AddTodo ws={ws} stageId={stage.id} />
                </div>
              );
            })}
            <div className="shrink-0 pt-6">
              <NewStage ws={ws} />
            </div>
          </div>
          <DragOverlay>
            {active ? (
              <div className="w-[248px] rotate-1 opacity-90">
                <TodoCard todo={active} onToggle={() => {}} onOpen={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-col gap-5">
          {stages.map((stage, i) => {
            const items = byColumn(stage.id);
            return (
              <section key={stage.id} className="group/col">
                <Header ws={ws} stage={stage} count={items.length} index={i} total={stages.length} />
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {items.map((t) => (
                    <TodoCard key={t.id} todo={t} onToggle={onToggle} onOpen={setSelectedId} />
                  ))}
                  <AddTodo ws={ws} stageId={stage.id} />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TodoDialog
        ws={ws}
        todo={selected}
        stages={stages}
        labels={labels}
        open={selectedId !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
      />
    </div>
  );
}
