"use client";

// Ownership reassignment. This reuses the owner columns that already exist on
// projects and clients, plus the two that 0029 added to spaces and lists. It is
// not a second permissions engine: reporting lines and archetypes stay the
// truth, and this only answers "who owns this thing".
import { reassignOwner, type OwnableEntity } from "@/lib/actions/admin";
import { OwnerPicker } from "./control-rows";

export function OwnerRow({
  ws,
  entity,
  entityId,
  ownerId,
  people,
}: {
  ws: string;
  entity: OwnableEntity;
  entityId: string;
  ownerId: string | null;
  people: { id: string; name: string }[];
}) {
  return (
    <OwnerPicker
      id={`owner-picker-${entity}-${entityId}`}
      value={ownerId}
      people={people}
      onSave={(next) => reassignOwner(ws, entity, entityId, next)}
    />
  );
}
