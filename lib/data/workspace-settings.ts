// The one place that defines how workspace settings and feature flags are read.
//
// Settings live once, at the workspace level. Nothing is copied into a member's
// account. "It applies to every account" is structural: there is one row, the
// whole app reads it through these helpers, so an admin change is already true
// for everyone the next time their screen reads. Do not query
// workspace_settings or workspace_features anywhere else.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Archetype, WorkspaceFeature, WorkspaceSettings } from "@/lib/types";

// Everything an admin can turn off. home, tasks, and admin are deliberately
// absent and can never be added: they are structural, and an executive who
// switched off admin would lock themselves out with no way back in.
export const TOGGLEABLE_FEATURES = [
  "departments",
  "clients",
  "projects",
  "database",
  "team",
  "hr",
  "performance",
  "calendar",
  "todos",
  "messages",
] as const;

export type FeatureKey = (typeof TOGGLEABLE_FEATURES)[number];

// Keys the read path hard-ignores. A row for one of these is treated as if it
// did not exist, so inserting one by hand cannot hide the admin area.
const STRUCTURAL_KEYS = new Set(["home", "tasks", "admin"]);

export function isToggleable(key: string): key is FeatureKey {
  return (TOGGLEABLE_FEATURES as readonly string[]).includes(key);
}

// The archetype ladder, defined once. Archetypes are not naturally ranked, so
// this is the agreed order: revenue sits alongside contributor.
const ARCHETYPE_RANK: Record<Archetype, number> = {
  executive: 4,
  domain_manager: 3,
  team_lead: 2,
  contributor: 1,
  revenue: 1,
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  departments: "Spaces",
  clients: "Clients",
  projects: "Projects",
  database: "Database",
  team: "Team",
  hr: "HR and leave",
  performance: "Performance",
  calendar: "Calendar",
  todos: "My to-dos",
  messages: "Messages",
};

// Falls back to the seeded defaults rather than throwing, so a screen never
// hangs on a missing row. The migration seeds one row per workspace, so this
// is a safety net, not the normal path.
const FALLBACK: Omit<WorkspaceSettings, "workspace_id"> = {
  display_name: null,
  timezone: "Asia/Dhaka",
  week_start_day: 0,
  locale: "en-US",
  logo_url: null,
  settings: {},
  updated_by: null,
  updated_at: new Date(0).toISOString(),
};

// The same resolution getWorkspaceSettings does, over rows something else
// already fetched. getWorkspaceContext reads settings and features in the
// same round trip as the session instead of after it, so it holds the rows
// and picks here. RLS has already scoped them; the filter keeps the code
// honest if a user ever belongs to two workspaces.
export function pickSettings(
  rows: unknown[] | null,
  workspaceId: string
): WorkspaceSettings {
  const hit = ((rows ?? []) as WorkspaceSettings[]).find(
    (r) => r.workspace_id === workspaceId
  );
  return hit ?? { workspace_id: workspaceId, ...FALLBACK };
}

export function pickFeatures(
  rows: unknown[] | null,
  workspaceId: string
): WorkspaceFeature[] {
  return ((rows ?? []) as WorkspaceFeature[]).filter(
    (f) => f.workspace_id === workspaceId && !STRUCTURAL_KEYS.has(f.feature_key)
  );
}

export const getWorkspaceSettings = cache(
  async (workspaceId: string): Promise<WorkspaceSettings> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspace_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return (data as WorkspaceSettings) ?? { workspace_id: workspaceId, ...FALLBACK };
  }
);

// One query per request, shared by the sidebar, the mobile nav, and every
// screen that gates on a feature.
export const getWorkspaceFeatures = cache(
  async (workspaceId: string): Promise<WorkspaceFeature[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspace_features")
      .select("*")
      .eq("workspace_id", workspaceId);
    return ((data ?? []) as WorkspaceFeature[]).filter(
      (f) => !STRUCTURAL_KEYS.has(f.feature_key)
    );
  }
);

// The gate. A feature with no row is on: a key that has not been configured
// yet should not disappear from the app.
export function featureAllows(
  features: WorkspaceFeature[],
  featureKey: string,
  archetype: Archetype
): boolean {
  if (STRUCTURAL_KEYS.has(featureKey)) return true;
  const row = features.find((f) => f.feature_key === featureKey);
  if (!row) return true;
  if (!row.enabled) return false;
  if (!row.min_archetype) return true;
  return ARCHETYPE_RANK[archetype] >= ARCHETYPE_RANK[row.min_archetype];
}

export async function isFeatureEnabled(
  workspaceId: string,
  featureKey: string,
  archetype: Archetype
): Promise<boolean> {
  return featureAllows(await getWorkspaceFeatures(workspaceId), featureKey, archetype);
}

// The set of keys a given archetype may see, for filtering navigation.
export function enabledKeysFor(
  features: WorkspaceFeature[],
  archetype: Archetype
): Set<string> {
  const keys = new Set<string>(STRUCTURAL_KEYS);
  for (const key of TOGGLEABLE_FEATURES) {
    if (featureAllows(features, key, archetype)) keys.add(key);
  }
  return keys;
}
