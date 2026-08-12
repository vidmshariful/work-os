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
import { DueDate } from "@/components/features/projects/due-date";
import { cn } from "@/lib/utils";
import { updateProjectStatus } from "@/lib/actions/projects";
import {
  ProjectContextMenu,
  ProjectOverflowButton,
  useProjectActions,
} from "./project-actions";
import { FieldChip, type ChipField } from "@/components/features/projects/field-chip";
import type { CompletionMap, ProjectWithOwner } from "./types";
import { BOARD_COLUMNS } from "./types";
import type { ProjectStatus } from "@/lib/types";

function CardBody({
  ws,
  p,
  completion,
  fields = [],
  fieldValues = {},
  canEdit = false,
  withActions = false,
}: {
  ws: string;
  p: ProjectWithOwner;
  completion: CompletionMap;
  // The space's choice fields, drawn on every card so the board says what
  // stage the work is at, not just who owns it and when it is due.
  fields?: ChipField[];
  fieldValues?: Record<string, Record<string, string>>;
  canEdit?: boolean;
  // Off for the drag overlay, where a menu button would be a target that
  // moves with the pointer.
  withActions?: boolean;
}) {
  const c = completion[p.id] ?? { done: 0, total: 0 };
  const fraction = c.total > 0 ? c.done / c.total : 0;
  return (
    <Card className="group p-3.5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between gap-2">
        <CodeLabel code={p.code} />
        <span className="flex items-center gap-1">
          <DueDate due={p.due_date} status={p.status} className="text-[11.5px]" />
          {withActions ? <ProjectOverflowButton project={p} /> : null}
        </span>
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
      {fields.length > 0 ? (
        <div className="mt-2.5 flex flex-col items-start gap-1 border-t border-border pt-2.5">
          {fields.map((f) => (
            <FieldChip
              key={f.id}
              ws={ws}
              projectId={p.id}
              field={f}
              value={fieldValues[p.id]?.[f.id] ?? null}
              canEdit={canEdit && withActions}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function DraggableCard({
  ws,
  p,
  completion,
  fields,
  fieldValues,
  canEdit,
  onOpen,
}: {
  ws: string;
  p: ProjectWithOwner;
  completion: CompletionMap;
  fields: ChipField[];
  fieldValues: Record<string, Record<string, string>>;
  canEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: p.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <ProjectContextMenu project={p}>
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        // The board's counterpart to data-project-row: how a card is found
        // by id, for the keyboard layer and for tests.
        data-board-card={p.id}
        onClick={() => onOpen(p.id)}
        className={cn(
          "cursor-grab touch-none rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:cursor-grabbing",
          isDragging && "opacity-40"
        )}
      >
        <CardBody
          ws={ws}
          p={p}
          completion={completion}
          fields={fields}
          fieldValues={fieldValues}
          canEdit={canEdit}
          withActions
        />
      </div>
    </ProjectContextMenu>
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
        // Named, so four empty columns do not all say the same thing, and
        // pointed at the one action a column actually offers.
        <div
          className={cn(
            "rounded-[14px] border border-dashed px-4 py-8 text-center text-[12.5px] text-text-3 transition-colors",
            isOver ? "border-brand text-brand" : "border-border"
          )}
        >
          {isOver ? `Drop to move here` : `Nothing in ${label.toLowerCase()}.`}
          {!isOver ? (
            <span className="mt-0.5 block text-[11.5px]">
              Drag a card here to move it.
            </span>
          ) : null}
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
  fields = [],
  fieldValues = {},
}: {
  ws: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
  // Absent on the Projects index, which spans spaces and so has no single
  // set of fields to draw.
  fields?: ChipField[];
  fieldValues?: Record<string, Record<string, string>>;
}) {
  const router = useRouter();
  // Present on the space page, absent on Projects. With it, a card change
  // made from the menu and one made by dragging share the same optimistic
  // state; without it the board keeps its own, which is how the surfaces that
  // have not adopted the menu carry on unchanged.
  const actions = useProjectActions();
  const [overlay, setOverlay] = useState<Record<string, ProjectStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const rows = (actions ? actions.resolve(projects) : projects).map((p) =>
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

    if (actions) {
      actions.setStatus(project, next);
      return;
    }

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
      // Stable, so the drag handle ids match between the server render and
      // the browser. See space-grouped-list.tsx for the full reason.
      id="project-board"
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
                  ws={ws}
                  p={p}
                  completion={completion}
                  fields={fields}
                  fieldValues={fieldValues}
                  // Per project, not per page: projects_update lets a manager
                  // edit any of them and an owner edit their own.
                  canEdit={actions?.canEdit(p) ?? false}
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
            <CardBody ws={ws} p={active} completion={completion} fields={fields} fieldValues={fieldValues} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
