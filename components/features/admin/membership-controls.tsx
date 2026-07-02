"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  updateMembership,
  type MembershipPatch,
} from "@/lib/actions/admin";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { ARCHETYPE_LABELS, ARCHETYPES } from "./shared";
import type { Archetype, RoleType, WallSide } from "@/lib/types";

const selectClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-[12.5px] text-text-1 outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-50";

function useSave(ws: string, membershipId: string) {
  const [pending, startTransition] = useTransition();
  const save = (patch: MembershipPatch) =>
    startTransition(async () => {
      const res = await updateMembership(ws, membershipId, patch);
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else toast.success("Saved.");
    });
  return { pending, save };
}

export function RoleSelect({
  ws,
  membershipId,
  value,
}: {
  ws: string;
  membershipId: string;
  value: RoleType;
}) {
  const { pending, save } = useSave(ws, membershipId);
  return (
    <select
      aria-label="Role"
      className={selectClass}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => save({ role: e.target.value as RoleType })}
    >
      {Object.entries(ROLE_LABELS).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function ArchetypeSelect({
  ws,
  membershipId,
  value,
}: {
  ws: string;
  membershipId: string;
  value: Archetype;
}) {
  const { pending, save } = useSave(ws, membershipId);
  return (
    <select
      aria-label="Archetype"
      className={selectClass}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => save({ archetype: e.target.value as Archetype })}
    >
      {ARCHETYPES.map((a) => (
        <option key={a} value={a}>
          {ARCHETYPE_LABELS[a]}
        </option>
      ))}
    </select>
  );
}

export function WallSideSelect({
  ws,
  membershipId,
  value,
}: {
  ws: string;
  membershipId: string;
  value: WallSide;
}) {
  const { pending, save } = useSave(ws, membershipId);
  return (
    <select
      aria-label="Wall side"
      className={selectClass}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => save({ wall_side: e.target.value as WallSide })}
    >
      <option value="above">Above</option>
      <option value="below">Below</option>
    </select>
  );
}

export function AdminReportsToSelect({
  ws,
  membershipId,
  value,
  options,
}: {
  ws: string;
  membershipId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const { pending, save } = useSave(ws, membershipId);
  return (
    <select
      aria-label="Reports to"
      className={selectClass}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => save({ reports_to: e.target.value || null })}
    >
      <option value="">Nobody</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function ActiveSwitch({
  ws,
  membershipId,
  value,
  isSelf,
}: {
  ws: string;
  membershipId: string;
  value: boolean;
  isSelf: boolean;
}) {
  const { pending, save } = useSave(ws, membershipId);
  return (
    <Switch
      aria-label="Active"
      defaultChecked={value}
      disabled={pending || isSelf}
      onCheckedChange={(checked) => save({ is_active: checked })}
    />
  );
}
