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
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateProjectStatus } from "@/lib/actions/projects";
import type { CompletionMap, ProjectWithOwner } from "./types";
import { BOARD_COLUMNS } from "./types";
import type { ProjectStatus } from "@/lib/types";

function CardBody({
  p,
  completion,
}: {
  p: ProjectWithOwner;
  completion: CompletionMap;
}) {
  const c = completion[p.id] ?? { done: 0, total: 0 };
  const fraction = c.total > 0 ? c.done / c.total : 0;
  return (
    <Card className="p-3.5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between gap-2">
        <CodeLabel code={p.code} />
        {p.due_date ? (
          <span className="font-mono text-[11.5px] text-text-3 tabular">
            {fmtDate(p.due_date)}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-text-1">
        {p.title}
      </p>
      <div className="mt-3 flex items-center justify-between">
        {p.owner ? (
          <PersonAvatar name={p.owner.full_name} src={p.owner.avatar_url} size={24} />
        ) : (
          <span className="text-[12px] text-text-3">No owner</span>
        )}
        <ProgressRing value={fraction} size={28} />
      </div>
    </Card>
  );
}

function DraggableCard({
  p,
  completion,
  onOpen,
}: {
  p: ProjectWithOwner;
  completion: CompletionMap;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: p.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(p.id)}
      className={cn(
        "cursor-grab touch-none rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <CardBody p={p} completion={completion} />
    </div>
  );
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: ProjectStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[100px] flex-col gap-3 rounded-[14px] p-1 transition-colors",
        isOver && "bg-surface-2 ring-1 ring-border-strong"
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3">
          {label}
        </span>
        <CountBadge count={count} className="ml-0" />
      </div>
      {count === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-text-3">
          Nothing here.
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// Board view: drag a project to another column to change its status. The move
// is optimistic and RLS-checked; a rejected write reverts and toasts, so a
// non-owner who drags gets a clean "not allowed" rather than a silent change.
export function ProjectBoard({
  ws,
  projects,
  completion,
}: {
  ws: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
}) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Record<string, ProjectStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const rows = projects.map((p) =>
    overlay[p.id] ? { ...p, status: overlay[p.id] } : p
  );
  const active = rows.find((p) => p.id === activeId) ?? null;
  const columnStatuses = BOARD_COLUMNS.map((c) => c.status);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const project = rows.find((p) => p.id === a.id);
    const next = over.id as ProjectStatus;
    if (!project || !columnStatuses.includes(next) || project.status === next) return;

    setOverlay((o) => ({ ...o, [project.id]: next }));
    void updateProjectStatus(ws, project.id, next).then((res) => {
      if (res.error) {
        setOverlay((o) => {
          const { [project.id]: _drop, ...rest } = o;
          return rest;
        });
        toast.error(res.error);
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => {
          const items = rows.filter((p) => p.status === col.status);
          return (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              count={items.length}
            >
              {items.map((p) => (
                <DraggableCard
                  key={p.id}
                  p={p}
                  completion={completion}
                  onOpen={(id) => router.push(`/${ws}/projects/${id}`)}
                />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <div className="w-[240px] rotate-1 opacity-90">
            <CardBody p={active} completion={completion} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
