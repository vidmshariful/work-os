import Link from "next/link";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { BOARD_STATUS_ORDER, STATUS_LABELS, DueDateLabel } from "./task-bits";
import type { TaskStatus } from "@/lib/types";

export interface BoardTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  assignee: { id: string; full_name: string; avatar_url: string | null } | null;
  project: { id: string; code: string };
}

// The team board for leads: every workspace task in six status columns.
export function TeamBoard({ ws, tasks }: { ws: string; tasks: BoardTask[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {BOARD_STATUS_ORDER.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-3">
                {STATUS_LABELS[status]}
              </span>
              <CountBadge count={items.length} className="ml-0" />
            </div>
            {items.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-border px-3 py-6 text-center text-[12px] text-text-3">
                Empty
              </div>
            ) : (
              items.map((t) => (
                <Link key={t.id} href={`/${ws}/tasks/${t.id}`}>
                  <Card className="p-3 transition-colors hover:border-border-strong">
                    <CodeLabel code={t.project.code} className="text-[11px]" />
                    <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-text-1">
                      {t.title}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between">
                      {t.assignee ? (
                        <PersonAvatar
                          name={t.assignee.full_name}
                          src={t.assignee.avatar_url}
                          size={22}
                        />
                      ) : (
                        <span className="text-[11px] text-text-3">Unassigned</span>
                      )}
                      <DueDateLabel date={t.due_date} status={t.status} className="text-[11px]" />
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
