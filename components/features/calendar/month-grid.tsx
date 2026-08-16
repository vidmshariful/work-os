import Link from "next/link";
import { cn } from "@/lib/utils";

// One calendar item, already resolved to a label, a tone, and an optional
// link. Sources: project deadlines, approved leave, manual events.
export interface CalendarItem {
  date: string; // YYYY-MM-DD, expanded per-day for ranges
  label: string;
  tone: "blue" | "violet" | "amber" | "teal" | "green" | "gray";
  href?: string;
  kind: "deadline" | "leave" | "event";
}

const TONE_CLASSES: Record<CalendarItem["tone"], string> = {
  // The same token pairs the Tag primitive uses. These were the hex values
  // copied out of it, which meant the calendar would have kept light-mode
  // text on a dark fill and been unreadable.
  blue: "bg-tag-blue-soft text-tag-blue-text",
  violet: "bg-tag-violet-soft text-tag-violet-text",
  amber: "bg-tag-amber-soft text-tag-amber-text",
  teal: "bg-tag-teal-soft text-tag-teal-text",
  green: "bg-tag-green-soft text-tag-green-text",
  gray: "bg-tag-gray-soft text-tag-gray-text",
};

const MAX_PILLS = 3;

function Pill({ item }: { item: CalendarItem }) {
  const inner = (
    <span
      className={cn(
        "block truncate rounded-[6px] px-1.5 py-0.5 text-label font-medium leading-4",
        TONE_CLASSES[item.tone],
        item.href && "hover:opacity-80"
      )}
    >
      {item.label}
    </span>
  );
  return item.href ? <Link href={item.href}>{inner}</Link> : inner;
}

export function MonthGrid({
  year,
  month, // 1-12
  todayIso,
  items,
}: {
  year: number;
  month: number;
  todayIso: string;
  items: CalendarItem[];
}) {
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  // Monday-first offset.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - lead);

  const weeks: { iso: string; day: number; inMonth: boolean }[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        iso: cursor.toISOString().slice(0, 10),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month - 1,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-7 border-b border-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-label font-semibold uppercase tracking-[0.06em] text-text-3"
          >
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
          {week.map((cell) => {
            const dayItems = byDate.get(cell.iso) ?? [];
            const isToday = cell.iso === todayIso;
            return (
              <div
                key={cell.iso}
                className={cn(
                  "min-h-[92px] border-r border-border p-1.5 last:border-r-0",
                  !cell.inMonth && "bg-surface-2"
                )}
              >
                <span
                  className={cn(
                    "mb-1 flex size-6 items-center justify-center rounded-full font-mono text-label tabular",
                    isToday
                      ? "bg-primary font-semibold text-primary-foreground"
                      : cell.inMonth
                        ? "text-text-2"
                        : "text-text-3"
                  )}
                >
                  {cell.day}
                </span>
                <div className="flex flex-col gap-0.5">
                  {dayItems.slice(0, MAX_PILLS).map((item, i) => (
                    <Pill key={`${item.label}-${i}`} item={item} />
                  ))}
                  {dayItems.length > MAX_PILLS ? (
                    <span className="px-1 font-mono text-micro text-text-3 tabular">
                      +{dayItems.length - MAX_PILLS} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
