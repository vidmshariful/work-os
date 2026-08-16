"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { ConfidentialChip } from "@/components/primitives/tag";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateClientStage } from "@/lib/actions/clients";
import { clientLabel, isConfidential } from "@/lib/wall";
import { STAGE_META, STAGE_ORDER } from "./stage";
import type { ClientStage, VClient } from "@/lib/types";
import type { OwnerProfile } from "./queries";

export interface PipelineClient extends VClient {
  daysInStage: number;
  outstanding: number;
}

function PipelineCard({
  client,
  owner,
  ws,
  dragging,
}: {
  client: PipelineClient;
  owner: OwnerProfile | null;
  ws: string;
  dragging?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-3.5 transition-shadow",
        dragging ? "shadow-[var(--shadow-pop)]" : "hover:border-border-strong"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <CodeLabel code={client.code} className="text-label" />
        <span className="font-mono text-label text-text-3 tabular">
          {client.daysInStage}d
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-body font-medium leading-snug text-text-1">
        <Link
          href={`/${ws}/clients/${client.id}`}
          className="truncate hover:text-brand"
          onClick={(e) => e.stopPropagation()}
        >
          {clientLabel(client)}
        </Link>
      </p>
      {isConfidential(client) ? (
        <div className="mt-1.5">
          <ConfidentialChip />
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between">
        {owner ? (
          <PersonAvatar name={owner.full_name} src={owner.avatar_url} size={22} />
        ) : (
          <span className="text-label text-text-3">Unassigned</span>
        )}
        <span className="flex flex-col items-end">
          {client.contract_value !== null ? (
            <span className="font-mono text-label font-medium text-text-1 tabular">
              {fmtMoney(client.contract_value)}
            </span>
          ) : null}
          {client.outstanding > 0 ? (
            <span className="font-mono text-micro text-wall tabular">
              {fmtMoney(client.outstanding)} due
            </span>
          ) : null}
        </span>
      </div>
    </Card>
  );
}

function DraggableCard(props: {
  client: PipelineClient;
  owner: OwnerProfile | null;
  ws: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.client.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none", isDragging && "opacity-40")}
    >
      <PipelineCard {...props} />
    </div>
  );
}

function StageColumn({
  stage,
  children,
  count,
}: {
  stage: ClientStage;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <span
          className={cn(
            "size-1.5 rounded-full",
            `bg-tag-${meta.tone}` as string
          )}
        />
        <span className="text-label font-semibold uppercase tracking-[0.06em] text-text-3">
          {meta.label}
        </span>
        <CountBadge count={count} className="ml-0" />
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[140px] flex-col gap-2.5 rounded-[14px] p-1 transition-colors",
          isOver && "bg-brand-soft/60"
        )}
      >
        {children}
        {count === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border px-3 py-8 text-center text-label text-text-3">
            {meta.hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The relationship pipeline. Drag a client between stages; the server
// action re-checks access and the database logs the move to the client's
// activity. Above-wall only surface.
export function PipelineBoard({
  ws,
  clients,
  owners,
}: {
  ws: string;
  clients: PipelineClient[];
  owners: Record<string, OwnerProfile>;
}) {
  const [items, setItems] = useState(clients);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const clientId = String(e.active.id);
    const target = e.over?.id as ClientStage | undefined;
    if (!target || !STAGE_ORDER.includes(target)) return;
    const current = items.find((c) => c.id === clientId);
    if (!current || current.stage === target) return;

    const previous = items;
    setItems((list) =>
      list.map((c) => (c.id === clientId ? { ...c, stage: target, daysInStage: 0 } : c))
    );
    startTransition(async () => {
      const res = await updateClientStage(ws, clientId, target);
      if (res.error) {
        setItems(previous);
        toast.error(res.error);
      }
    });
  };

  const active = activeId ? items.find((c) => c.id === activeId) : null;

  return (
    <DndContext
      id="client-pipeline"
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {STAGE_ORDER.map((stage) => {
          const inStage = items.filter((c) => c.stage === stage);
          return (
            <StageColumn key={stage} stage={stage} count={inStage.length}>
              {inStage.map((c) => (
                <DraggableCard
                  key={c.id}
                  client={c}
                  owner={c.owner_id ? owners[c.owner_id] ?? null : null}
                  ws={ws}
                />
              ))}
            </StageColumn>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <PipelineCard
            client={active}
            owner={active.owner_id ? owners[active.owner_id] ?? null : null}
            ws={ws}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
