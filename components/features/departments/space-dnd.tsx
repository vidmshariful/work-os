"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";

// What a droppable represents. A row is more specific than the section that
// contains it, so a pointer inside a row must resolve to the row.
export type DropKind = "group" | "row" | "section";

export interface DropData {
  kind: DropKind;
  // group: the group key. row: the project id. section: the list id.
  id: string;
}

export interface DragData {
  kind: "project" | "section";
  id: string;
  // Where it started, so a rollback knows what to restore.
  fromGroup?: string;
  parentId?: string | null;
}

// Rows sit inside sections, so plain pointerWithin can return either. Rank the
// candidates so the innermost meaningful target wins: a row beats the group
// behind it, which is what makes "drop onto a parent" distinguishable from
// "drop into this group".
const RANK: Record<DropKind, number> = { row: 0, section: 1, group: 2 };

export const preferInnermost: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length <= 1) return hits;
  return [...hits].sort((a, b) => {
    const ka = (a.data?.droppableContainer?.data?.current as DropData | undefined)?.kind;
    const kb = (b.data?.droppableContainer?.data?.current as DropData | undefined)?.kind;
    return (RANK[ka ?? "group"] ?? 9) - (RANK[kb ?? "group"] ?? 9);
  });
};

export function useSpaceSensors() {
  return useSensors(
    // A little travel before a drag starts, so a plain click still opens the
    // project rather than picking it up.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );
}

export function Draggable({
  id,
  data,
  disabled,
  children,
  className,
}: {
  id: string;
  data: DragData;
  disabled?: boolean;
  children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data,
    disabled,
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40", className)}>
      {/* The handle owns the listeners, not the whole row, so text stays
          selectable and the row's own click still works. */}
      {children(
        disabled ? {} : ({ ...listeners, ...attributes } as React.HTMLAttributes<HTMLElement>)
      )}
    </div>
  );
}

export function Droppable({
  id,
  data,
  disabled,
  className,
  activeClassName,
  children,
}: {
  id: string;
  data: DropData;
  disabled?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && activeClassName)}>
      {children}
    </div>
  );
}

export { DndContext, DragOverlay, useSensors };
export type { DragEndEvent, DragStartEvent };
