import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CircleCheckBig,
  Eye,
  FolderKanban,
  ListTodo,
  MessageSquare,
  Plane,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import { ListRow } from "@/components/primitives/list-row";
import { Tag, TaskStatusChip } from "@/components/primitives/tag";
import { ProgressBar } from "@/components/primitives/progress";
import { PersonAvatar } from "@/components/primitives/avatar";
import { CodeLabel } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { fmtDate } from "@/lib/format";
import { TimeAgo } from "@/components/primitives/local-time";
import { notificationHref } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  project: { workspace_id: string; code: string };
}
interface TodoRow {
  id: string;
  workspace_id: string;
  title: string;
  due_date: string | null;
}
interface ProjectRow {
  id: string;
  workspace_id: string;
  code: string;
  title: string;
  status: string;
  due_date: string | null;
}
interface AwayRow {
  id: string;
  start_date: string;
  end_date: string;
  profile: { full_name: string; avatar_url: string | null } | null;
}

// The personal dashboard answers one question before any other: what needs me
// today. Everything else on the page is context for that answer, which is why
// the first card merges overdue tasks and overdue to-dos into a single list
// rather than making somebody check two places and do the sorting themselves.
export default async function PersonalDashboard() {
  const session = await getSession();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const year = new Date().getFullYear();

  const [
    { data: tasks },
    { data: todos },
    { data: notifications },
    { data: projects },
    { data: balances },
    { data: away },
    { count: unreadMessages },
    { data: myLeave },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, project:projects!inner(workspace_id, code)")
      .eq("assignee_id", session.userId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase
      .from("personal_todos")
      .select("id, workspace_id, title, due_date")
      .eq("profile_id", session.userId)
      .eq("is_done", false)
      .not("due_date", "is", null)
      .lte("due_date", weekEnd)
      .order("due_date"),
    supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("projects")
      .select("id, workspace_id, code, title, status, due_date")
      .eq("owner_id", session.userId)
      .neq("status", "archived")
      .neq("status", "delivered")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase
      .from("leave_balances")
      .select("workspace_id, total_days, used_days")
      .eq("profile_id", session.userId)
      .eq("year", year),
    // Who is away, trimmed by RLS to what this person may know: their own
    // leave, their reports' if they lead, everything if they are an executive.
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, profile:profiles!leave_requests_profile_id_fkey(full_name, avatar_url)")
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", today)
      .order("start_date")
      .limit(6),
    supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", session.userId)
      .is("read_at", null),
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, status")
      .eq("profile_id", session.userId)
      .in("status", ["pending", "approved"])
      .gte("end_date", today)
      .order("start_date")
      .limit(3),
  ]);

  const wsById = new Map(session.memberships.map((m) => [m.workspace.id, m.workspace]));
  const openTasks = (tasks ?? []) as unknown as TaskRow[];
  const openTodos = (todos ?? []) as TodoRow[];
  const owned = (projects ?? []) as ProjectRow[];
  const awayRows = (away ?? []) as unknown as AwayRow[];

  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today);
  const dueTodayTasks = openTasks.filter((t) => t.due_date === today);
  const dueThisWeek = openTasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd);
  const inReview = openTasks.filter((t) => t.status === "review");
  const blocked = openTasks.filter((t) => t.status === "blocked");
  const overdueTodos = openTodos.filter((t) => t.due_date && t.due_date < today);
  const todayTodos = openTodos.filter((t) => t.due_date === today);
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  // One queue, most urgent first, tasks and to-dos together. A person does not
  // think in tables when they sit down in the morning.
  const focus = [
    ...overdueTasks.map((t) => ({ kind: "task" as const, at: t.due_date!, late: true, t })),
    ...overdueTodos.map((t) => ({ kind: "todo" as const, at: t.due_date!, late: true, t })),
    ...dueTodayTasks.map((t) => ({ kind: "task" as const, at: t.due_date!, late: false, t })),
    ...todayTodos.map((t) => ({ kind: "todo" as const, at: t.due_date!, late: false, t })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const balance = (balances ?? [])[0] as { total_days: number; used_days: number } | undefined;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session.profile.full_name.split(" ")[0];
  const primary = session.memberships[0]?.workspace;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            {greeting}, {firstName}
          </h1>
          <p className="page-subtitle mt-1">
            {focus.length === 0
              ? "Nothing is late and nothing is due today."
              : `${focus.length} thing${focus.length === 1 ? "" : "s"} want your attention today.`}
          </p>
        </div>
        {primary ? (
          <Link
            href={`/${primary.slug}/home`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-primary px-3.5 text-body font-medium text-primary-foreground transition-colors hover:bg-black"
          >
            Enter {primary.name}
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<TriangleAlert />}
          value={overdueTasks.length + overdueTodos.length}
          label="Overdue"
          tone={overdueTasks.length + overdueTodos.length > 0 ? "rose" : "gray"}
          hint={overdueTodos.length > 0 ? `${overdueTodos.length} of them to-dos` : undefined}
        />
        <StatCard
          icon={<CalendarDays />}
          value={dueThisWeek.length + dueTodayTasks.length}
          label="Due this week"
          tone="amber"
        />
        <StatCard icon={<Eye />} value={inReview.length} label="In review" tone="violet" />
        <StatCard
          icon={<MessageSquare />}
          value={(unreadMessages ?? 0) + unread}
          label="Unread"
          tone="blue"
          hint={`${unreadMessages ?? 0} messages, ${unread} alerts`}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              divider
              title="Needs you today"
              action={
                blocked.length > 0 ? (
                  <span className="text-meta text-danger">{blocked.length} blocked</span>
                ) : null
              }
            />
            {focus.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<CircleCheckBig />}
                title="Nothing late and nothing due today. Pick up something from this week below."
              />
            ) : (
              <div>
                {focus.slice(0, 8).map((f) => {
                  const ws =
                    f.kind === "task"
                      ? wsById.get(f.t.project.workspace_id)
                      : wsById.get(f.t.workspace_id);
                  const href =
                    f.kind === "task"
                      ? ws && `/${ws.slug}/tasks/${f.t.id}`
                      : ws && `/${ws.slug}/todos`;
                  return (
                    <ListRow
                      key={`${f.kind}-${f.t.id}`}
                      title={
                        <span className="flex min-w-0 items-center gap-2">
                          {f.kind === "todo" ? (
                            <ListTodo className="size-3.5 shrink-0 text-text-3" strokeWidth={1.5} />
                          ) : null}
                          <span className="truncate">{f.t.title}</span>
                          {f.kind === "task" ? <CodeLabel code={f.t.project.code} /> : null}
                        </span>
                      }
                      meta={
                        <>
                          <span
                            className={cn(
                              "font-mono text-meta tabular",
                              f.late ? "font-medium text-danger" : "text-text-2"
                            )}
                          >
                            {f.late ? "late" : "today"} {fmtDate(f.at)}
                          </span>
                          {f.kind === "task" ? <TaskStatusChip status={f.t.status} /> : null}
                        </>
                      }
                      trailing={
                        href ? (
                          <Link
                            href={href}
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
              divider
              title="Later this week"
              action={<span className="text-meta text-text-3">{dueThisWeek.length}</span>}
            />
            {dueThisWeek.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<FolderKanban />}
                title="Nothing else is due in the next seven days."
              />
            ) : (
              <div>
                {dueThisWeek.slice(0, 6).map((t) => {
                  const ws = wsById.get(t.project.workspace_id);
                  return (
                    <ListRow
                      key={t.id}
                      title={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{t.title}</span>
                          <CodeLabel code={t.project.code} />
                        </span>
                      }
                      meta={
                        <>
                          <span className="font-mono text-meta text-text-2 tabular">
                            {fmtDate(t.due_date!)}
                          </span>
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

          {owned.length > 0 ? (
            <Card>
              <CardHeader divider title="Projects you own" />
              <div>
                {owned.map((p) => {
                  const ws = wsById.get(p.workspace_id);
                  const late = p.due_date && p.due_date < today;
                  return (
                    <ListRow
                      key={p.id}
                      title={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{p.title}</span>
                          <CodeLabel code={p.code} />
                        </span>
                      }
                      meta={
                        <>
                          {p.due_date ? (
                            <span
                              className={cn(
                                "font-mono text-meta tabular",
                                late ? "font-medium text-danger" : "text-text-2"
                              )}
                            >
                              {fmtDate(p.due_date)}
                            </span>
                          ) : null}
                          <Tag tone="gray">{p.status.replace("_", " ")}</Tag>
                        </>
                      }
                      trailing={
                        ws ? (
                          <Link
                            href={`/${ws.slug}/projects/${p.id}`}
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
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {session.memberships.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-lead font-semibold"
                  style={{
                    backgroundColor: `${m.workspace.accent_color}1A`,
                    color: m.workspace.accent_color,
                  }}
                >
                  {m.workspace.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-lead font-semibold text-text-1">
                    {m.workspace.name}
                  </div>
                  <div className="text-meta text-text-2">{ROLE_LABELS[m.role] ?? m.role}</div>
                </div>
              </div>
              <Link
                href={`/${m.workspace.slug}/home`}
                className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-border text-body font-medium text-text-1 transition-colors hover:bg-surface-2"
              >
                Enter workspace
                <ArrowRight className="size-4" />
              </Link>
            </Card>
          ))}

          {balance ? (
            <Card>
              <CardHeader title={`Leave, ${year}`} />
              <CardBody>
                <div className="flex items-end justify-between">
                  <span className="font-mono text-h2 font-semibold text-text-1 tabular">
                    {Number(balance.total_days) - Number(balance.used_days)}
                  </span>
                  <span className="pb-1 text-meta text-text-2">
                    of {Number(balance.total_days)} days left
                  </span>
                </div>
                <ProgressBar
                  value={
                    Number(balance.total_days) > 0
                      ? Number(balance.used_days) / Number(balance.total_days)
                      : 0
                  }
                  className="mt-2"
                />
                {(myLeave ?? []).length > 0 ? (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                    {(myLeave ?? []).map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-meta text-text-2 tabular">
                          {fmtDate(l.start_date)} to {fmtDate(l.end_date)}
                        </span>
                        <Tag tone={l.status === "approved" ? "green" : "blue"}>{l.status}</Tag>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {awayRows.length > 0 ? (
            <Card>
              <CardHeader title="Away this week" />
              <div>
                {awayRows.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <PersonAvatar
                      name={a.profile?.full_name}
                      src={a.profile?.avatar_url}
                      size={24}
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-text-1">
                      {a.profile?.full_name ?? "Teammate"}
                    </span>
                    <span className="shrink-0 font-mono text-meta text-text-2 tabular">
                      {fmtDate(a.start_date)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Notifications"
              action={
                <Link href="/notifications" className="text-meta font-medium text-brand hover:underline">
                  View all
                </Link>
              }
            />
            {(notifications ?? []).length === 0 ? (
              <EmptyState size="compact" icon={<Bell />} title="You are all caught up." />
            ) : (
              <div>
                {(notifications ?? []).map((n) => {
                  const ws = wsById.get(n.workspace_id);
                  const href = ws ? notificationHref(ws.slug, n.entity_type, n.entity_id) : null;
                  const inner = (
                    <>
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-body font-medium text-text-1">{n.title}</p>
                        <p className="mt-0.5 text-label text-text-3">
                          <TimeAgo at={n.created_at} />
                        </p>
                      </div>
                    </>
                  );
                  const base = "flex gap-2.5 border-b border-border px-4 py-2.5 last:border-b-0";
                  return href ? (
                    <Link key={n.id} href={href} className={`${base} transition-colors hover:bg-surface-2`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className={base}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {(myLeave ?? []).length === 0 && !balance ? (
            <Card>
              <CardBody className="pt-4">
                <p className="flex items-center gap-2 text-meta text-text-2">
                  <Plane className="size-3.5 text-text-3" strokeWidth={1.5} />
                  No leave balance set for this year yet.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
