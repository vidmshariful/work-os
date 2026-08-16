"use client";

// The three reusable pieces of the Admin Control Center. Built once here and
// used across General, Features, and Ownership so nothing is redundant.
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const controlSelectClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-meta text-text-1 outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-50";

export const controlInputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-50";

// A labelled row: name and description on the left, the control on the right.
// The layout every settings screen uses.
export function SettingRow({
  label,
  description,
  htmlFor,
  control,
  className,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-body font-medium text-text-1"
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-meta text-text-3">{description}</p>
        ) : null}
      </div>
      <div className="w-full shrink-0 sm:w-[260px]">{control}</div>
    </div>
  );
}

// A SettingRow whose control is a switch, plus the optional archetype floor.
// Saving is immediate: a toggle that needs a save button reads as broken.
export function ToggleRow({
  id,
  label,
  description,
  enabled,
  minArchetype,
  archetypeOptions,
  onSave,
}: {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  minArchetype: string | null;
  archetypeOptions: { value: string; label: string }[];
  onSave: (patch: {
    enabled?: boolean;
    min_archetype?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();

  const save = (patch: { enabled?: boolean; min_archetype?: string | null }) =>
    startTransition(async () => {
      const res = await onSave(patch);
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else toast.success("Saved.");
    });

  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <div className="flex items-center justify-end gap-2">
          <select
            id={`feature-min-archetype-${id}`}
            aria-label={`Minimum role for ${label}`}
            className={cn(controlSelectClass, "w-[150px]")}
            defaultValue={minArchetype ?? ""}
            disabled={pending || !enabled}
            onChange={(e) => save({ min_archetype: e.target.value || null })}
          >
            <option value="">Everyone</option>
            {archetypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} and up
              </option>
            ))}
          </select>
          <Switch
            id={`feature-toggle-${id}`}
            aria-label={label}
            defaultChecked={enabled}
            disabled={pending}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </div>
      }
    />
  );
}

// One person select, used for spaces, lists, projects, and clients alike.
export function OwnerPicker({
  id,
  value,
  people,
  onSave,
}: {
  id: string;
  value: string | null;
  people: { id: string; name: string }[];
  onSave: (ownerId: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      id={id}
      aria-label="Owner"
      className={controlSelectClass}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value || null;
        startTransition(async () => {
          const res = await onSave(next);
          if (!res.ok) toast.error(res.error ?? "Could not save.");
          else toast.success("Owner updated.");
        });
      }}
    >
      <option value="">Nobody</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
