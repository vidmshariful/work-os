import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/primitives/card";
import { STATUS_DOT } from "@/components/features/projects/status-dot";
import type { ProjectWithOwner } from "@/components/features/projects/types";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A month grid of the list's projects, placed on their due dates. Month is
// YYYY-MM; base is the calendar URL to hang prev/next off.
export function ProjectCalendar({
  ws,
  base,
  month,
  projects,
}: {
  ws: string;
  base: string;
  month: string;
  projects: ProjectWithOwner[];
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const byDay = new Map<number, ProjectWithOwner[]>();
  for (const p of projects) {
    if (!p.due_date) continue;
    if (p.due_date.slice(0, 7) !== month) continue;
    const d = Number(p.due_date.slice(8, 10));
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-text-1">
          {MONTHS[m - 1]} {y}
        </h3>
        <div className="flex items-center gap-1">
          <Link href={`${base}&m=${prev}`} aria-label="Previous month" className="rounded-[7px] p-1 text-text-2 hover:bg-surface-2">
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </Link>
          <Link href={`${base}&m=${next}`} aria-label="Next month" className="rounded-[7px] p-1 text-text-2 hover:bg-surface-2">
            <ChevronRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {WD.map((w) => (
          <div key={w} className="bg-surface-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-text-3">
            {w}
          </div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className="min-h-[92px] bg-surface p-1.5">
            {d ? (
              <>
                <div className="mb-1 px-0.5 text-[11.5px] font-medium text-text-3 tabular">{d}</div>
                <div className="flex flex-col gap-1">
                  {(byDay.get(d) ?? []).map((p) => (
                    <Link
                      key={p.id}
                      href={`/${ws}/projects/${p.id}`}
                      className="flex items-center gap-1 rounded-[6px] bg-surface-2 px-1.5 py-1 text-[11px] text-text-1 hover:bg-accent-soft"
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[p.status] }} />
                      <span className="truncate">{p.title}</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
