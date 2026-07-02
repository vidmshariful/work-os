// Row shapes for the KPI SQL views (supabase/migrations/0008_kpi_views.sql)
// plus small pure helpers. The views run under the reader's RLS, so nothing
// here widens access. KPI is exhaust, not input: every number is computed.

import type { Archetype } from "@/lib/types";
import { fmtPercent } from "@/lib/format";

export interface KpiPersonRow {
  workspace_id: string;
  profile_id: string;
  tasks_completed: number;
  tasks_open: number;
  completed_30d: number;
  avg_cycle_days: number | null;
  on_time_rate: number | null;
  revisions_total: number;
  revision_rate: number | null;
}

export interface KpiRollupRow {
  workspace_id: string;
  manager_id: string;
  reports_count: number;
  tasks_completed: number;
  tasks_open: number;
  completed_30d: number;
  avg_cycle_days: number | null;
  on_time_rate: number | null;
  revisions_total: number;
  revision_rate: number | null;
}

// Membership row with the joined profile, as fetched for KPI tables.
export interface KpiMember {
  profile_id: string;
  reports_to: string | null;
  archetype: Archetype;
  profile: { full_name: string; avatar_url: string | null } | null;
}

// Placeholder for a metric that does not exist yet, for example an on-time
// rate before any task with a due date has been completed.
export const DASH = "—";

// PostgREST serializes numerics as numbers, but be defensive about strings.
export function asNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function pctOrDash(v: number | string | null | undefined): string {
  const n = asNum(v);
  return n === null ? DASH : fmtPercent(n);
}

export function numOrDash(v: number | string | null | undefined): string {
  const n = asNum(v);
  return n === null ? DASH : String(n);
}

// Everyone who rolls up to rootId through reports_to, root included.
// Mirrors the recursive chain in v_kpi_rollup, computed in TS for the
// per-person table.
export function subtreeIds(
  members: Pick<KpiMember, "profile_id" | "reports_to">[],
  rootId: string
): Set<string> {
  const children = new Map<string, string[]>();
  for (const m of members) {
    if (!m.reports_to) continue;
    const arr = children.get(m.reports_to) ?? [];
    arr.push(m.profile_id);
    children.set(m.reports_to, arr);
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return seen;
}

// Studio on-time rate, weighted by each person's completed count so one
// person with a single task does not swing the average.
export function weightedOnTimeRate(rows: KpiPersonRow[]): number | null {
  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    const rate = asNum(r.on_time_rate);
    const completed = asNum(r.tasks_completed) ?? 0;
    if (rate === null || completed <= 0) continue;
    weighted += rate * completed;
    weight += completed;
  }
  return weight > 0 ? weighted / weight : null;
}

export function sumBy(
  rows: KpiPersonRow[],
  key: "tasks_completed" | "tasks_open" | "completed_30d"
): number {
  return rows.reduce((acc, r) => acc + (asNum(r[key]) ?? 0), 0);
}

export function byName(a: KpiMember, b: KpiMember): number {
  return (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? "");
}
