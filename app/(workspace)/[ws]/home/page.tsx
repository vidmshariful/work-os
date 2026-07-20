import type { Metadata } from "next";
import Link from "next/link";
import {
  SquareCheckBig,
  CalendarClock,
  Eye,
  CircleCheckBig,
  Megaphone,
  Bell,
  FolderKanban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardHeader } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import { ListRow } from "@/components/primitives/list-row";
import { TaskStatusChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { RightRailPanel } from "@/components/primitives/right-rail";
import { EmptyState } from "@/components/primitives/empty-state";
import { fmtDate, fmtTimeAgo } from "@/lib/format";
import type { Announcement, Notification, TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

interface HomeTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  revision_count: number;
  project: { workspace_id: string; code: string };
}

export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data: myTasks }, { data: announcements }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, status, due_date, revision_count, project:projects!inner(workspace_id, code)"
        )
        .eq("assignee_id", ctx.userId)
        .eq("project.workspace_id", ctx.workspace.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("announcements")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("notifications")
        .select("*")
        .eq("profile_id", ctx.userId)
        .eq("workspace_id", ctx.workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const tasks = (myTasks ?? []) as unknown as HomeTask[];
  const open = tasks.filter((t) => t.status !== "done");
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueSoon = open.filter((t) => t.due_date && t.due_date <= week);
  const inReview = open.filter((t) => t.status === "review");
  const done30 = tasks.filter((t) => t.status === "done").length;
  const firstName = ctx.profile.full_name.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Here is where your work stands today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<SquareCheckBig />} value={open.length} label="Open tasks" tone="blue" />
        <StatCard icon={<CalendarClock />} value={dueSoon.length} label="Due in 7 days" tone="amber" />
        <StatCard icon={<Eye />} value={inReview.length} label="In review" tone="violet" />
        <StatCard icon={<CircleCheckBig />} value={done30} label="Completed" tone="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="My work"
            action={
              <Link
                href={`/${ws}/tasks`}
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                View all
              </Link>
            }
          />
          {open.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title="Nothing on your plate. Check the project boards for what is next."
            />
          ) : (
            <div>
              {open.slice(0, 8).map((t) => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  subtitle={<CodeLabel code={t.project.code} />}
                  meta={
                    <>
                      {t.due_date ? (
                        <span className="font-mono text-[12px] text-text-2 tabular">
                          {fmtDate(t.due_date)}
                        </span>
                      ) : null}
                      <TaskStatusChip status={t.status} />
                    </>
                  }
                  trailing={
                    <Link
                      href={`/${ws}/tasks/${t.id}`}
                      className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                    >
                      Open
                    </Link>
                  }
                />
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <RightRailPanel title="Announcements">
            {(announcements ?? []).length === 0 ? (
              <p className="py-3 text-center text-[12.5px] text-text-3">
                Nothing posted yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {((announcements ?? []) as Announcement[]).map((a) => (
                  <div key={a.id} className="rounded-[10px] bg-surface-2 p-3">
                    <div className="flex items-center gap-2">
                      <Megaphone className="size-3.5 text-text-3" />
                      <span className="text-[13px] font-medium text-text-1">{a.title}</span>
                    </div>
                    {a.body ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">{a.body}</p>
                    ) : null}
                    <p className="mt-1.5 text-[11.5px] text-text-3">{fmtTimeAgo(a.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </RightRailPanel>

          <RightRailPanel
            title="Recent notifications"
            action={
              <Link href="/notifications" className="text-[12px] font-medium text-brand hover:underline">
                All
              </Link>
            }
          >
            {(notifications ?? []).length === 0 ? (
              <p className="py-3 text-center text-[12.5px] text-text-3">You are all caught up.</p>
            ) : (
              <div className="flex flex-col">
                {((notifications ?? []) as Notification[]).map((n) => (
                  <div key={n.id} className="flex gap-2 border-b border-border py-2.5 last:border-b-0">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-text-1">{n.title}</p>
                      <p className="text-[11px] text-text-3">{fmtTimeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </RightRailPanel>
        </div>
      </div>
    </div>
  );
}
