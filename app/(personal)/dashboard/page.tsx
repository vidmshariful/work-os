import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SquareCheckBig, Bell, FolderKanban } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { Tag, TaskStatusChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { fmtDate } from "@/lib/format";
import { TimeAgo } from "@/components/primitives/local-time";
import type { TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  project: { workspace_id: string; code: string };
}

export default async function PersonalDashboard() {
  const session = await getSession();
  const supabase = await createClient();

  const [{ data: tasks }, { data: notifications }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, project:projects!inner(workspace_id, code)")
      .eq("assignee_id", session.userId)
      .not("status", "in", "(done)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const wsById = new Map(session.memberships.map((m) => [m.workspace.id, m.workspace]));
  const openTasks = (tasks ?? []) as unknown as TaskRow[];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session.profile.full_name.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">
          {greeting}, {firstName}
        </h1>
        <p className="page-subtitle mt-1">
          Your view across every workspace you belong to.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {session.memberships.map((m) => {
          const wsTasks = openTasks.filter((t) => t.project.workspace_id === m.workspace.id);
          return (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 items-center justify-center rounded-[10px] text-lead font-semibold"
                    style={{ backgroundColor: `${m.workspace.accent_color}1A`, color: m.workspace.accent_color }}
                  >
                    {m.workspace.name.slice(0, 1)}
                  </span>
                  <div>
                    <div className="text-lead font-semibold text-text-1">{m.workspace.name}</div>
                    <div className="text-meta text-text-2">{ROLE_LABELS[m.role] ?? m.role}</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4 text-meta text-text-2">
                <span className="flex items-center gap-1.5">
                  <SquareCheckBig className="size-3.5" />
                  {wsTasks.length} open task{wsTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              <Link
                href={`/${m.workspace.slug}/home`}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-primary px-3.5 text-body font-medium text-primary-foreground transition-colors hover:bg-black"
              >
                Enter workspace
                <ArrowRight className="size-4" />
              </Link>
            </Card>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="My work" />
          {openTasks.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title="Nothing assigned right now. Enter a workspace to pick up work."
            />
          ) : (
            <div>
              {openTasks.map((t) => {
                const ws = wsById.get(t.project.workspace_id);
                return (
                  <ListRow
                    key={t.id}
                    title={t.title}
                    subtitle={<CodeLabel code={t.project.code} />}
                    meta={
                      <>
                        {ws ? <Tag tone="blue">{ws.name}</Tag> : null}
                        {t.due_date ? (
                          <span className="font-mono text-meta text-text-2 tabular">
                            {fmtDate(t.due_date)}
                          </span>
                        ) : null}
                        <TaskStatusChip status={t.status} />
                      </>
                    }
                    trailing={
                      ws ? (
                        <Link
                          href={`/${ws.slug}/tasks/${t.id}`}
                          className="rounded-[8px] px-2.5 py-1 text-meta font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                        >
                          Open
                        </Link>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent notifications"
            action={
              <Link href="/notifications" className="text-meta font-medium text-brand hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="px-0 pb-2">
            {(notifications ?? []).length === 0 ? (
              <EmptyState icon={<Bell />} title="You are all caught up." />
            ) : (
              (notifications ?? []).map((n) => {
                const ws = wsById.get(n.workspace_id);
                return (
                  <div key={n.id} className="flex gap-2.5 border-b border-border px-5 py-3 last:border-b-0">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`} />
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text-1">{n.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-label text-text-3">
                        {ws ? <span>{ws.name}</span> : null}
                        <span><TimeAgo at={n.created_at} /></span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
