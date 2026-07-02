import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardHeader } from "@/components/primitives/card";
import { Tag, type TagTone } from "@/components/primitives/tag";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { deleteEvent } from "@/lib/actions/events";
import {
  MonthGrid,
  type CalendarItem,
} from "@/components/features/calendar/month-grid";

export const metadata: Metadata = { title: "Calendar" };

const EVENT_TONES: Record<string, CalendarItem["tone"]> = {
  shoot: "amber",
  meeting: "teal",
  holiday: "green",
  other: "gray",
};

function monthBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

// Expand a date range into per-day items, clamped to the visible month.
function* eachDay(startIso: string, endIso: string, clampStart: string, clampEnd: string) {
  const from = startIso < clampStart ? clampStart : startIso;
  const to = endIso > clampEnd ? clampEnd : endIso;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ m?: string; mine?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : todayIso.slice(0, 7);
  const [year, month] = m.split("-").map(Number);
  const mineOnly = sp.mine === "1";
  const { start, end } = monthBounds(year, month);

  const prev = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);

  const [
    { data: projects },
    { data: leave },
    { data: events },
    { data: myTaskProjects },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, due_date, owner_id")
      .eq("workspace_id", ctx.workspace.id)
      .gte("due_date", start)
      .lte("due_date", end)
      .neq("status", "archived"),
    supabase
      .from("leave_requests")
      .select("id, profile_id, start_date, end_date, person:profiles!leave_requests_profile_id_fkey(full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("events")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .lte("start_date", end)
      .or(`end_date.gte.${start},and(end_date.is.null,start_date.gte.${start})`),
    mineOnly
      ? supabase
          .from("tasks")
          .select("project_id, project:projects!inner(workspace_id)")
          .eq("assignee_id", ctx.userId)
          .eq("project.workspace_id", ctx.workspace.id)
      : Promise.resolve({ data: [] }),
  ]);

  const myProjectIds = new Set(
    ((myTaskProjects ?? []) as unknown as { project_id: string }[]).map((t) => t.project_id)
  );

  const items: CalendarItem[] = [];

  for (const p of (projects ?? []) as unknown as {
    id: string;
    code: string;
    due_date: string;
    owner_id: string | null;
  }[]) {
    if (mineOnly && p.owner_id !== ctx.userId && !myProjectIds.has(p.id)) continue;
    items.push({
      date: p.due_date,
      label: `${p.code} due`,
      tone: "blue",
      href: `/${ws}/projects/${p.id}`,
      kind: "deadline",
    });
  }

  for (const l of (leave ?? []) as unknown as {
    id: string;
    profile_id: string;
    start_date: string;
    end_date: string;
    person: { full_name: string } | null;
  }[]) {
    if (mineOnly && l.profile_id !== ctx.userId) continue;
    const first = (l.person?.full_name ?? "Someone").split(" ")[0];
    for (const day of eachDay(l.start_date, l.end_date, start, end)) {
      items.push({ date: day, label: `${first} leave`, tone: "violet", kind: "leave" });
    }
  }

  const manualEvents = (events ?? []) as unknown as {
    id: string;
    title: string;
    type: string;
    start_date: string;
    end_date: string | null;
    created_by: string | null;
    description: string | null;
  }[];
  for (const e of manualEvents) {
    for (const day of eachDay(e.start_date, e.end_date ?? e.start_date, start, end)) {
      items.push({
        date: day,
        label: e.title,
        tone: EVENT_TONES[e.type] ?? "gray",
        kind: "event",
      });
    }
  }

  // This week agenda: today through the next 7 days, across month borders.
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const agenda = items
    .filter((i) => i.date >= todayIso && i.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const navLink = (target: string, label: React.ReactNode, aria: string) => (
    <Link
      href={`/${ws}/calendar?m=${target}${mineOnly ? "&mine=1" : ""}`}
      aria-label={aria}
      className="flex h-8 items-center justify-center rounded-[8px] border border-border bg-surface px-2 text-sm font-medium text-text-2 transition-colors hover:text-text-1"
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Calendar</h1>
          <p className="mt-1 text-sm text-text-2">
            Deadlines and approved leave land here on their own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {navLink(prev, <ChevronLeft className="size-4" />, "Previous month")}
            {navLink(todayIso.slice(0, 7), "Today", "Current month")}
            {navLink(next, <ChevronRight className="size-4" />, "Next month")}
          </div>
          <span className="min-w-[130px] text-center text-[15px] font-semibold text-text-1">
            {monthName}
          </span>
          <Link
            href={`/${ws}/calendar${mineOnly ? `?m=${m}` : `?m=${m}&mine=1`}`}
            className={cn(
              "rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              mineOnly
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-surface text-text-2 hover:text-text-1"
            )}
          >
            Mine only
          </Link>
          {ctx.capabilities.canCreateEvents ? (
            <Button asChild>
              <Link href={`/${ws}/calendar/new`}>
                <Plus />
                New event
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <MonthGrid year={year} month={month} todayIso={todayIso} items={items} />

      <Card>
        <CardHeader title="This week" />
        {agenda.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="A quiet week ahead." />
        ) : (
          <div>
            {agenda.map((item, i) => {
              const manual =
                item.kind === "event"
                  ? manualEvents.find(
                      (e) =>
                        e.title === item.label &&
                        item.date >= e.start_date &&
                        item.date <= (e.end_date ?? e.start_date)
                    )
                  : undefined;
              const canDelete =
                manual &&
                (manual.created_by === ctx.userId ||
                  ctx.membership.archetype === "executive");
              return (
                <div
                  key={`${item.date}-${item.label}-${i}`}
                  className="group flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0"
                >
                  <span className="w-14 font-mono text-[12px] text-text-2 tabular">
                    {fmtDate(item.date)}
                  </span>
                  <Tag tone={item.tone as TagTone} dot>
                    {item.kind === "deadline"
                      ? "Deadline"
                      : item.kind === "leave"
                        ? "Leave"
                        : "Event"}
                  </Tag>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-text-1 hover:text-brand"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-1">
                      {item.label}
                    </span>
                  )}
                  {canDelete ? (
                    <form action={deleteEvent}>
                      <input type="hidden" name="ws" value={ws} />
                      <input type="hidden" name="id" value={manual!.id} />
                      <button
                        aria-label={`Delete ${item.label}`}
                        className="rounded-[7px] p-1.5 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.5} />
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
