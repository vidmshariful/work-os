"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import { Card } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel } from "@/components/primitives/misc";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CompletionMap,
  ProjectWithOwner,
} from "@/components/features/projects/types";

// The List view of a list's projects. Top-level projects are rows; a project
// with sub-projects gets a chevron that collapses its children.
export function CollapsibleProjectList({
  ws,
  projects,
  completion,
}: {
  ws: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
}) {
  const tops = projects.filter((p) => !p.parent_project_id);
  const subsByParent = new Map<string, ProjectWithOwner[]>();
  for (const p of projects) {
    if (!p.parent_project_id) continue;
    const arr = subsByParent.get(p.parent_project_id) ?? [];
    arr.push(p);
    subsByParent.set(p.parent_project_id, arr);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function meta(p: ProjectWithOwner, sub: boolean) {
    return (
      <>
        {p.owner ? (
          <PersonAvatar name={p.owner.full_name} src={p.owner.avatar_url} size={sub ? 20 : 22} />
        ) : null}
        {p.due_date ? (
          <span className="font-mono text-[12px] text-text-2 tabular">{fmtDate(p.due_date)}</span>
        ) : null}
        <ProjectStatusChip status={p.status} />
      </>
    );
  }

  function open(id: string) {
    return (
      <Link
        href={`/${ws}/projects/${id}`}
        className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
      >
        Open
      </Link>
    );
  }

  return (
    <Card>
      {tops.map((p) => {
        const c = completion[p.id] ?? { done: 0, total: 0 };
        const subs = subsByParent.get(p.id) ?? [];
        const hasSubs = subs.length > 0;
        const expanded = !collapsed.has(p.id);
        return (
          <div key={p.id}>
            <ListRow
              leading={
                <div className="flex items-center gap-1">
                  {hasSubs ? (
                    <button
                      onClick={() => toggle(p.id)}
                      aria-label={expanded ? "Collapse sub-projects" : "Expand sub-projects"}
                      className="rounded-[6px] p-0.5 text-text-3 hover:text-text-1"
                    >
                      <ChevronRight
                        className={cn("size-4 transition-transform", expanded && "rotate-90")}
                        strokeWidth={2}
                      />
                    </button>
                  ) : (
                    <span className="w-5" />
                  )}
                  <ProgressRing value={c.total > 0 ? c.done / c.total : 0} size={32} />
                </div>
              }
              title={
                <Link href={`/${ws}/projects/${p.id}`} className="hover:underline">
                  {p.title}
                </Link>
              }
              subtitle={
                <span className="flex items-center gap-2">
                  <CodeLabel code={p.code} />
                  {hasSubs ? (
                    <span className="flex items-center gap-1 text-text-3">
                      <Layers className="size-3.5" strokeWidth={1.5} />
                      {subs.length} sub-project{subs.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              }
              meta={meta(p, false)}
              trailing={open(p.id)}
            />
            {hasSubs && expanded
              ? subs.map((s) => {
                  const sc = completion[s.id] ?? { done: 0, total: 0 };
                  return (
                    <ListRow
                      key={s.id}
                      className="border-l-2 border-l-border bg-surface-2/40 pl-8"
                      leading={<ProgressRing value={sc.total > 0 ? sc.done / sc.total : 0} size={26} />}
                      title={
                        <Link href={`/${ws}/projects/${s.id}`} className="hover:underline">
                          {s.title}
                        </Link>
                      }
                      subtitle={<CodeLabel code={s.code} />}
                      meta={meta(s, true)}
                      trailing={open(s.id)}
                    />
                  );
                })
              : null}
          </div>
        );
      })}
    </Card>
  );
}
