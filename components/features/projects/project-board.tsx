import Link from "next/link";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { fmtDate } from "@/lib/format";
import type { CompletionMap, ProjectWithOwner } from "./types";
import { BOARD_COLUMNS } from "./types";

// Board view: four status columns of compact project cards. Archived
// projects live in the list view only.
export function ProjectBoard({
  ws,
  projects,
  completion,
}: {
  ws: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((col) => {
        const items = projects.filter((p) => p.status === col.status);
        return (
          <div key={col.status} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3">
                {col.label}
              </span>
              <CountBadge count={items.length} className="ml-0" />
            </div>
            {items.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-text-3">
                Nothing here.
              </div>
            ) : (
              items.map((p) => {
                const c = completion[p.id] ?? { done: 0, total: 0 };
                const fraction = c.total > 0 ? c.done / c.total : 0;
                return (
                  <Link key={p.id} href={`/${ws}/projects/${p.id}`}>
                    <Card className="p-3.5 transition-colors hover:border-border-strong">
                      <div className="flex items-center justify-between gap-2">
                        <CodeLabel code={p.code} />
                        {p.due_date ? (
                          <span className="font-mono text-[11.5px] text-text-3 tabular">
                            {fmtDate(p.due_date)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-text-1">
                        {p.title}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        {p.owner ? (
                          <PersonAvatar
                            name={p.owner.full_name}
                            src={p.owner.avatar_url}
                            size={24}
                          />
                        ) : (
                          <span className="text-[12px] text-text-3">
                            No owner
                          </span>
                        )}
                        <ProgressRing value={fraction} size={28} />
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
