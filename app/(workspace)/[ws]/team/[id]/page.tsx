import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheckBig, Clock, RefreshCcw, SquareCheckBig } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardHeader } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import { ListRow } from "@/components/primitives/list-row";
import { TaskStatusChip, Tag } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { fmtDate, fmtPercent } from "@/lib/format";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { ARCHETYPE_META, type Member } from "@/components/features/team/labels";
import {
  OffboardButton,
  ReportsToSelect,
} from "@/components/features/team/team-controls";
import type { TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Person" };

interface KpiRow {
  tasks_completed: number;
  completed_30d: number;
  avg_cycle_days: number | null;
  on_time_rate: number | null;
  revision_rate: number | null;
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: memberRow } = await supabase
    .from("memberships")
    .select("*, profile:profiles!profile_id(*)")
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", id)
    .maybeSingle();
  if (!memberRow) notFound();
  const member = memberRow as unknown as Member;
  const isExec = ctx.membership.archetype === "executive";

  // KPI is visible to the person, their direct lead, and managers.
  const canSeeKpi =
    id === ctx.userId ||
    isExec ||
    ctx.membership.archetype === "domain_manager" ||
    member.reports_to === ctx.userId;

  const [{ data: taskRows }, kpiRes, { data: managerRow }, { data: memberOptions }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, due_date, project:projects!inner(workspace_id, code)")
        .eq("assignee_id", id)
        .eq("project.workspace_id", ctx.workspace.id)
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(12),
      canSeeKpi
        ? supabase
            .from("v_kpi_person")
            .select("*")
            .eq("workspace_id", ctx.workspace.id)
            .eq("profile_id", id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      member.reports_to
        ? supabase.from("profiles").select("id, full_name").eq("id", member.reports_to).maybeSingle()
        : Promise.resolve({ data: null }),
      isExec
        ? supabase
            .from("memberships")
            .select("profile_id, profile:profiles!profile_id!inner(full_name)")
            .eq("workspace_id", ctx.workspace.id)
            .eq("is_active", true)
        : Promise.resolve({ data: [] }),
    ]);

  const kpi = (kpiRes.data ?? null) as KpiRow | null;
  const manager = (managerRow ?? null) as { id: string; full_name: string } | null;
  const meta = ARCHETYPE_META[member.archetype];
  const tasks = (taskRows ?? []) as unknown as {
    id: string;
    title: string;
    status: TaskStatus;
    due_date: string | null;
    project: { code: string };
  }[];
  const options = ((memberOptions ?? []) as unknown as {
    profile_id: string;
    profile: { full_name: string };
  }[]).map((m) => ({ id: m.profile_id, full_name: m.profile.full_name }));

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Team", href: `/${ws}/team` },
          { label: member.profile.full_name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <PersonAvatar
            name={member.profile.full_name}
            src={member.profile.avatar_url}
            size={56}
          />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="page-title">
                {member.profile.full_name}
              </h1>
              <Tag tone={meta.tone}>{meta.label}</Tag>
              {!member.is_active ? <Tag tone="gray">Inactive</Tag> : null}
            </div>
            <p className="mt-0.5 text-body text-text-2">
              {ROLE_LABELS[member.role] ?? member.role}
              {manager ? (
                <>
                  {" · reports to "}
                  <Link href={`/${ws}/team/${manager.id}`} className="font-medium text-text-1 hover:text-brand">
                    {manager.full_name}
                  </Link>
                </>
              ) : null}
            </p>
            <p className="mt-0.5 text-meta text-text-3">{member.profile.email}</p>
          </div>
        </div>
        {isExec && member.is_active && id !== ctx.userId ? (
          <div className="flex items-center gap-2">
            <span className="text-meta text-text-2">Reports to</span>
            <ReportsToSelect
              ws={ws}
              profileId={id}
              reportsTo={member.reports_to}
              members={options}
            />
            <OffboardButton ws={ws} profileId={id} name={member.profile.full_name} />
          </div>
        ) : null}
      </div>

      {kpi && canSeeKpi ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<CircleCheckBig />}
            value={kpi.tasks_completed}
            label="Tasks completed"
            tone="green"
          />
          <StatCard
            icon={<SquareCheckBig />}
            value={kpi.on_time_rate !== null ? fmtPercent(Number(kpi.on_time_rate)) : "—"}
            label="On-time rate"
            tone="blue"
          />
          <StatCard
            icon={<Clock />}
            value={kpi.avg_cycle_days !== null ? `${kpi.avg_cycle_days}d` : "—"}
            label="Average cycle"
            tone="violet"
          />
          <StatCard
            icon={<RefreshCcw />}
            value={kpi.revision_rate !== null ? Number(kpi.revision_rate).toFixed(1) : "—"}
            label="Revisions per task"
            tone="amber"
          />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Open tasks" />
        {tasks.length === 0 ? (
          <EmptyState icon={<SquareCheckBig />} title="Nothing open right now." />
        ) : (
          tasks.map((t) => (
            <ListRow
              key={t.id}
              title={t.title}
              subtitle={<CodeLabel code={t.project.code} />}
              meta={
                <>
                  {t.due_date ? (
                    <span className="font-mono text-meta text-text-2 tabular">
                      {fmtDate(t.due_date)}
                    </span>
                  ) : null}
                  <TaskStatusChip status={t.status} />
                </>
              }
              trailing={
                <Link
                  href={`/${ws}/tasks/${t.id}`}
                  className="rounded-[8px] px-2.5 py-1 text-meta font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                >
                  Open
                </Link>
              }
            />
          ))
        )}
      </Card>
    </div>
  );
}
