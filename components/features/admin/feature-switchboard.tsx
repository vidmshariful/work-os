"use client";

// The feature switchboard. Toggling here writes one row in workspace_features,
// which lib/data/workspace-settings.ts reads and lib/rbac.ts filters navigation
// by, so the change reaches every member's sidebar on their next read.
import { toggleFeature } from "@/lib/actions/admin";
import { ToggleRow } from "./control-rows";
import { ARCHETYPE_LABELS } from "./shared";
import type { Archetype, WorkspaceFeature } from "@/lib/types";

// Ordered by the ladder, so "and up" reads correctly in the select.
const ARCHETYPE_FLOORS: Archetype[] = [
  "executive",
  "domain_manager",
  "team_lead",
  "contributor",
];

export function FeatureSwitchboard({
  ws,
  features,
  catalogue,
}: {
  ws: string;
  features: WorkspaceFeature[];
  catalogue: { key: string; label: string; description: string }[];
}) {
  const options = ARCHETYPE_FLOORS.map((a) => ({
    value: a,
    label: ARCHETYPE_LABELS[a],
  }));

  return (
    <div className="flex flex-col">
      {catalogue.map((item) => {
        const row = features.find((f) => f.feature_key === item.key);
        return (
          <ToggleRow
            key={item.key}
            id={item.key}
            label={item.label}
            description={item.description}
            enabled={row?.enabled ?? true}
            minArchetype={row?.min_archetype ?? null}
            archetypeOptions={options}
            onSave={(patch) =>
              toggleFeature(ws, item.key, {
                enabled: patch.enabled,
                min_archetype: patch.min_archetype as Archetype | null | undefined,
              })
            }
          />
        );
      })}
    </div>
  );
}
