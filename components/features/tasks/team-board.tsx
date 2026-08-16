"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { cn } from "@/lib/utils";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { BOARD_STATUS_ORDER, STATUS_LABELS, DueDateLabel } from "./task-bits";
import type { TaskStatus } from "@/lib/types";

export interface BoardTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  assignee: { id: string; full_name: string; avatar_url: string | null } | null;
  project: { id: string; code: string };
}

function CardBody({ t }: { t: BoardTask }) {
  return (
    <Card className="p-3 transition-colors hover:border-border-strong">
      <CodeLabel code={t.project.code} className="text-label" />
      <p className="mt-1 line-clamp-2 text-body font-medium leading-snug text-text-1">
        {t.title}
      </p>
      <div className="mt-2.5 flex items-center justify-between">
        {t.assignee ? (
          <PersonAvatar
            name={t.assignee.full_name}
            src={t.assignee.avatar_url}
            size={22}
          />
        ) : (
          <span className="text-label text-text-3">Unassigned</span>
        )}
        <DueDateLabel date={t.due_date} status={t.status} className="text-label" />
      </div>
    </Card>
  );
}

function DraggableCard({
  t,
  onOpen,
}: {
  t: BoardTask;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: t.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(t.id)}
      className={cn(
        "cursor-grab touch-none rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <CardBody t={t} />
    </div>
  );
}

function Column({
  status,
  count,
  children,
}: {
  status: TaskStatus;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[80px] flex-col gap-2.5 rounded-[12px] p-1 transition-colors",
        isOver && "bg-surface-2 ring-1 ring-border-strong"
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="text-label font-semibold uppercase tracking-[0.06em] text-text-3">
          {STATUS_LABELS[status]}
        </span>
        <CountBadge count={count} className="ml-0" />
      </div>
      {count === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border px-3 py-6 text-center text-meta text-text-3">
          Empty
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// The team board for leads: drag a card to another column to change its
// status. The move is optimistic; a rejected write reverts and toasts. The
// board is leads-only, so every card here is movable by the viewer.
export function TeamBoard({ ws, tasks }: { ws: string; tasks: BoardTask[] }) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Record<string, TaskStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const rows = tasks.map((t) =>
    overlay[t.id] ? { ...t, status: overlay[t.id] } : t
  );
  const active = rows.find((t) => t.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const task = rows.find((t) => t.id === a.id);
    const next = over.id as TaskStatus;
    if (!task || !BOARD_STATUS_ORDER.includes(next) || task.status === next) return;

    setOverlay((o) => ({ ...o, [task.id]: next }));
    void updateTaskStatus(ws, task.id, next).then((res) => {
      if (res.error) {
        setOverlay((o) => {
          const { [task.id]: _drop, ...rest } = o;
          return rest;
        });
        toast.error(res.error);
      }
    });
  }

  return (
    <DndContext
      id="team-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {BOARD_STATUS_ORDER.map((status) => {
          const items = rows.filter((t) => t.status === status);
          return (
            <Column key={status} status={status} count={items.length}>
              {items.map((t) => (
                <DraggableCard key={t.id} t={t} onOpen={(id) => router.push(`/${ws}/tasks/${id}`)} />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <div className="w-[220px] rotate-1 opacity-90">
            <CardBody t={active} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
