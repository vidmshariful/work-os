import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Tag } from "@/components/primitives/tag";
import { EmptyState } from "@/components/primitives/empty-state";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { cn } from "@/lib/utils";
import { ARCHETYPE_META, type Member } from "@/components/features/team/labels";
import { OrgChart } from "@/components/features/team/org-chart";
import { OnboardDialog } from "@/components/features/team/team-controls";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  const isExec = ctx.membership.archetype === "executive";
  const view = sp.view === "chart" ? "chart" : "directory";
  const supabase = await createClient();

  const [{ data: memberRows }, { data: openTasks }] = await Promise.all([
    supabase
      .from("memberships")
      .select("*, profile:profiles!profile_id(*)")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at"),
    supabase
      .from("tasks")
      .select("assignee_id, project:projects!inner(workspace_id)")
      .eq("project.workspace_id", ctx.workspace.id)
      .neq("status", "done")
      .not("assignee_id", "is", null),
  ]);

  const all = (memberRows ?? []) as unknown as Member[];
  const active = all.filter((m) => m.is_active);
  const shown = isExec ? all : active;
  const nameById = new Map(active.map((m) => [m.profile_id, m.profile.full_name]));
  const openCount = new Map<string, number>();
  for (const t of (openTasks ?? []) as unknown as { assignee_id: string }[]) {
    openCount.set(t.assignee_id, (openCount.get(t.assignee_id) ?? 0) + 1);
  }

  const tab = (v: string, label: string) => (
    <Link
      href={v === "directory" ? `/${ws}/team` : `/${ws}/team?view=${v}`}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "rounded-[9px] px-3 py-1.5 text-sm font-medium transition-colors",
        view === v ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Team</h1>
          <p className="mt-1 text-sm text-text-2">
            {active.length} people, one reporting line that drives access and rollups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
            {tab("directory", "Directory")}
            {tab("chart", "Org chart")}
          </div>
          {isExec ? (
            <OnboardDialog
              ws={ws}
              members={active.map((m) => ({ id: m.profile_id, full_name: m.profile.full_name }))}
            />
          ) : null}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={<Users />} title="No members yet." />
        </Card>
      ) : view === "chart" ? (
        <OrgChart members={active} ws={ws} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => {
            const meta = ARCHETYPE_META[m.archetype];
            const open = openCount.get(m.profile_id) ?? 0;
            return (
              <Link key={m.id} href={`/${ws}/team/${m.profile_id}`}>
                <Card className="h-full p-5 transition-colors hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2">
                    <PersonAvatar
                      name={m.profile.full_name}
                      src={m.profile.avatar_url}
                      size={44}
                    />
                    <div className="flex flex-col items-end gap-1.5">
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      {!m.is_active ? <Tag tone="gray">Inactive</Tag> : null}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-[15px] font-semibold text-text-1">
                      {m.profile.full_name}
                    </div>
                    <div className="text-[12.5px] text-text-2">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[12px] text-text-3">
                    <span>
                      {m.reports_to && nameById.get(m.reports_to)
                        ? `Reports to ${nameById.get(m.reports_to)}`
                        : "Top of the line"}
                    </span>
                    <span className="font-mono tabular">
                      {open} open
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
