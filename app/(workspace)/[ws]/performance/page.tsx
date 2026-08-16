import type { Metadata } from "next";
import { CircleCheckBig, Clock, RefreshCcw, SquareCheckBig, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardHeader } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import {
  PerformanceTabs,
  type PerformanceTab,
} from "@/components/features/performance/performance-tabs";
import { PersonKpiTable } from "@/components/features/performance/person-kpi-table";
import { RateCard } from "@/components/features/performance/rate-card";
import { DataTable } from "@/components/primitives/data-table";
import { PersonAvatar } from "@/components/primitives/avatar";
import {
  asNum,
  numOrDash,
  pctOrDash,
  subtreeIds,
  sumBy,
  weightedOnTimeRate,
  type KpiMember,
  type KpiPersonRow,
  type KpiRollupRow,
} from "@/components/features/performance/kpi";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const tabs: PerformanceTab[] = [{ key: "me", label: "My performance" }];
  if (ctx.capabilities.canSeeTeamPerformance) tabs.push({ key: "team", label: "Team" });
  if (ctx.capabilities.canSeeStudioPerformance) tabs.push({ key: "studio", label: "Studio" });
  const active = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "me";

  const [{ data: kpiRows }, { data: memberRows }, { data: rollupRows }] =
    await Promise.all([
      supabase.from("v_kpi_person").select("*").eq("workspace_id", ctx.workspace.id),
      supabase
        .from("memberships")
        .select("profile_id, reports_to, archetype, role, profile:profiles!profile_id(full_name, avatar_url)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      active === "team" || active === "studio"
        ? supabase.from("v_kpi_rollup").select("*").eq("workspace_id", ctx.workspace.id)
        : Promise.resolve({ data: [] }),
    ]);

  const kpis = (kpiRows ?? []) as KpiPersonRow[];
  const members = (memberRows ?? []) as unknown as (KpiMember & { role: string })[];
  const rollups = (rollupRows ?? []) as KpiRollupRow[];
  const kpiByProfile = new Map(kpis.map((k) => [k.profile_id, k]));
  const mine = kpiByProfile.get(ctx.userId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Performance
          </h1>
          <p className="page-subtitle mt-1">
            Computed from completed work. Nothing here is typed by hand.
          </p>
        </div>
        <PerformanceTabs ws={ws} tabs={tabs} active={active} />
      </div>

      {active === "me" ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<CircleCheckBig />}
            value={asNum(mine?.tasks_completed) ?? 0}
            label="Tasks completed"
            hint={`${asNum(mine?.completed_30d) ?? 0} in the last 30 days`}
            tone="green"
          />
          <RateCard
            value={mine?.on_time_rate}
            label="On-time rate"
            hint="Completed against due date"
          />
          <StatCard
            icon={<Clock />}
            value={numOrDash(mine?.avg_cycle_days)}
            label="Average cycle days"
            tone="violet"
          />
          <StatCard
            icon={<RefreshCcw />}
            value={numOrDash(mine?.revision_rate)}
            label="Revisions per task"
            tone="amber"
          />
        </div>
      ) : null}

      {active === "team" ? (
        <TeamView
          ctxUserId={ctx.userId}
          members={members}
          kpis={kpis}
          kpiByProfile={kpiByProfile}
          rollups={rollups}
        />
      ) : null}

      {active === "studio" ? (
        <StudioView members={members} kpis={kpis} kpiByProfile={kpiByProfile} rollups={rollups} />
      ) : null}
    </div>
  );
}

function TeamView({
  ctxUserId,
  members,
  kpis,
  kpiByProfile,
  rollups,
}: {
  ctxUserId: string;
  members: (KpiMember & { role: string })[];
  kpis: KpiPersonRow[];
  kpiByProfile: Map<string, KpiPersonRow>;
  rollups: KpiRollupRow[];
}) {
  const subtree = subtreeIds(members, ctxUserId);
  const team = members.filter((m) => subtree.has(m.profile_id));
  const myRollup = rollups.find((r) => r.manager_id === ctxUserId);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Users />}
          value={asNum(myRollup?.reports_count) ?? Math.max(0, team.length - 1)}
          label="People in your line"
          tone="blue"
        />
        <StatCard
          icon={<CircleCheckBig />}
          value={asNum(myRollup?.tasks_completed) ?? 0}
          label="Tasks completed"
          hint={`${asNum(myRollup?.completed_30d) ?? 0} in the last 30 days`}
          tone="green"
        />
        <RateCard value={myRollup?.on_time_rate} label="On-time rate" />
        <StatCard
          icon={<SquareCheckBig />}
          value={asNum(myRollup?.tasks_open) ?? 0}
          label="Open tasks"
          tone="amber"
        />
      </div>
      <Card>
        <CardHeader title="Your reporting line" />
        <PersonKpiTable people={team} kpiByProfile={kpiByProfile} />
      </Card>
    </>
  );
}

function StudioView({
  members,
  kpis,
  kpiByProfile,
  rollups,
}: {
  members: (KpiMember & { role: string })[];
  kpis: KpiPersonRow[];
  kpiByProfile: Map<string, KpiPersonRow>;
  rollups: KpiRollupRow[];
}) {
  const leads = members.filter(
    (m) => m.archetype === "team_lead" || m.archetype === "domain_manager"
  );
  const rollupByManager = new Map(rollups.map((r) => [r.manager_id, r]));
  const leadRows = leads.map((l) => {
    const r = rollupByManager.get(l.profile_id);
    const name = l.profile?.full_name ?? "Unknown";
    return {
      lead: (
        <span className="flex items-center gap-2.5">
          <PersonAvatar name={name} src={l.profile?.avatar_url} size={26} />
          <span className="truncate text-body font-medium text-text-1">{name}</span>
        </span>
      ),
      reports: asNum(r?.reports_count) ?? 0,
      completed: asNum(r?.tasks_completed) ?? 0,
      onTime: pctOrDash(r?.on_time_rate),
      cycle: numOrDash(r?.avg_cycle_days),
    };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Users />}
          value={members.length}
          label="Active people"
          tone="blue"
        />
        <StatCard
          icon={<CircleCheckBig />}
          value={sumBy(kpis, "tasks_completed")}
          label="Tasks completed"
          hint={`${sumBy(kpis, "completed_30d")} in the last 30 days`}
          tone="green"
        />
        <RateCard
          value={weightedOnTimeRate(kpis)}
          label="Studio on-time rate"
          hint="Weighted by completed work"
        />
        <StatCard
          icon={<SquareCheckBig />}
          value={sumBy(kpis, "tasks_open")}
          label="Open tasks"
          tone="amber"
        />
      </div>
      {leadRows.length > 0 ? (
        <Card>
          <CardHeader title="By lead" />
          <DataTable
            columns={[
              { key: "lead", label: "Lead" },
              { key: "reports", label: "Reports", align: "right", mono: true },
              { key: "completed", label: "Completed", align: "right", mono: true },
              { key: "onTime", label: "On-time", align: "right", mono: true },
              { key: "cycle", label: "Cycle days", align: "right", mono: true },
            ]}
            rows={leadRows}
          />
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Everyone" />
        <PersonKpiTable people={members} kpiByProfile={kpiByProfile} />
      </Card>
    </>
  );
}
