"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Columns3 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel } from "@/components/primitives/misc";
import { DueDate } from "@/components/features/projects/due-date";
import { PROJECT_STATUS_OPTIONS } from "@/components/features/projects/types";
import {
  ProjectContextMenu,
  ProjectOverflowButton,
  SelectBox,
  useProjectActionsRequired,
} from "@/components/features/projects/project-actions";
import { TimeAgo } from "@/components/primitives/local-time";
import { cn } from "@/lib/utils";
import type {
  CompletionMap,
  MemberOption,
  ProjectWithOwner,
} from "@/components/features/projects/types";
import type { ProjectStatus } from "@/lib/types";
import { buildSpaceQuery, type SortKey, type SpaceFilters } from "./space-filters";

// Column visibility is a personal preference, not a property of a space, so
// it is remembered once per user and applies wherever they open a table.
const columnsKeyFor = (userId: string) => `workos:space-table-columns:${userId}`;

// Every column maps onto the shared sort state, so clicking a header moves
// the same sort the control bar shows. There is no second sort mechanism.
const COLUMNS = [
  { key: "title", label: "Project", sort: "title" },
  { key: "code", label: "Code", sort: "code" },
  { key: "list", label: "List", sort: "list" },
  { key: "status", label: "Status", sort: "status" },
  { key: "assignee", label: "Assignee", sort: "assignee" },
  { key: "due", label: "Due date", sort: "due" },
  { key: "progress", label: "Progress", sort: "progress" },
  { key: "updated", label: "Last updated", sort: "updated" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

// Project is never hideable: a row with no name is not a row.
const LOCKED: ColumnKey = "title";

export function SpaceTable({
  ws,
  base,
  userId,
  filters,
  projects,
  completion,
  listNames,
  members,
  canManage,
  viewerId,
  contextIds,
}: {
  ws: string;
  base: string;
  userId: string;
  filters: SpaceFilters;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
  listNames: Map<string, string>;
  members: MemberOption[];
  // projects_update allows a manager on any row, or the owner on their own.
  // Editability is therefore per row, never per page: someone who owns three
  // of fifteen projects must not get controls on the other twelve.
  canManage: boolean;
  viewerId: string;
  contextIds?: Set<string>;
}) {
  const router = useRouter();
  const actions = useProjectActionsRequired();
  const rows = actions.resolve(projects);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [restored, setRestored] = useState(false);
  const storageKey = columnsKeyFor(userId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setHidden(new Set(JSON.parse(raw) as ColumnKey[]));
    } catch {
      // A blocked store just means every column shows.
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      // Not remembered, still usable.
    }
  }, [hidden, restored, storageKey]);

  const shown = COLUMNS.filter((c) => !hidden.has(c.key));
  const allSelected =
    rows.length > 0 && rows.every((p) => actions.selected.has(p.id));

  // Clicking the active column flips direction, a new column starts ascending.
  const sortHref = (sort: SortKey) => {
    const dir = filters.sort === sort && filters.dir === "asc" ? "desc" : "asc";
    const qs = buildSpaceQuery({ ...filters, sort, dir, view: "table" });
    return qs ? `${base}?${qs}` : base;
  };

  const cellClass = "px-3 py-2 text-meta text-text-2 align-middle";
  // The first column stays put while the rest scrolls sideways.
  const stickyCell =
    "sticky left-0 z-10 bg-surface group-hover/row:bg-surface-2 px-3 py-2 align-middle";

  return (
    <div className="rounded-[14px] border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-meta text-text-3">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Show or hide columns"
              className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border px-2.5 text-meta font-medium text-text-2 transition-colors hover:text-text-1"
            >
              <Columns3 className="size-3.5" strokeWidth={1.5} />
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            {COLUMNS.map((col) => {
              const on = !hidden.has(col.key);
              const locked = col.key === LOCKED;
              return (
                <button
                  key={col.key}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(col.key)) n.delete(col.key);
                      else n.add(col.key);
                      return n;
                    })
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-body transition-colors",
                    locked
                      ? "cursor-not-allowed text-text-3"
                      : "text-text-1 hover:bg-surface-2"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
                      on ? "border-brand bg-brand" : "border-border-strong"
                    )}
                  />
                  {col.label}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-20 bg-surface-2">
            <tr>
              {/* Selection is a column here, not a hover affordance: a table
                  is the view people come to when they mean to act on many
                  rows at once. */}
              <th
                scope="col"
                className="sticky left-0 z-30 w-9 border-b border-border bg-surface-2 px-3 py-2"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allSelected}
                  aria-label={allSelected ? "Clear selection" : "Select all rows"}
                  onClick={() =>
                    actions.setSelection(allSelected ? [] : rows.map((p) => p.id))
                  }
                  className={cn(
                    "flex size-4 items-center justify-center rounded-[5px] border transition-colors",
                    allSelected
                      ? "border-brand bg-brand text-white"
                      : "border-border-strong hover:border-text-3"
                  )}
                >
                  {allSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
              </th>
              {shown.map((col, i) => {
                const active = filters.sort === col.sort;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      active
                        ? filters.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "whitespace-nowrap border-b border-border text-left text-label font-semibold uppercase tracking-[0.06em] text-text-3",
                      i === 0 && "sticky left-9 z-30 bg-surface-2"
                    )}
                  >
                    <Link
                      href={sortHref(col.sort as SortKey)}
                      scroll={false}
                      className="flex items-center gap-1 px-3 py-2 transition-colors hover:text-text-1"
                    >
                      {col.label}
                      {active ? (
                        filters.dir === "asc" ? (
                          <ArrowUp className="size-3 text-brand" strokeWidth={2.5} />
                        ) : (
                          <ArrowDown className="size-3 text-brand" strokeWidth={2.5} />
                        )
                      ) : null}
                    </Link>
                  </th>
                );
              })}
              <th scope="col" className="w-10 border-b border-border">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = completion[p.id] ?? { done: 0, total: 0 };
              const isContext = contextIds?.has(p.id) ?? false;
              const canEdit = canManage || p.owner_id === viewerId;
              const isSelected = actions.selected.has(p.id);
              const isFocused = actions.focusedId === p.id;
              const open = () => router.push(`/${ws}/projects/${p.id}`);
              return (
                <ProjectContextMenu key={p.id} project={p}>
                <tr
                  onClick={open}
                  // The same anchor the list view carries, so j and k, Enter,
                  // x, and e work here too rather than going quiet the moment
                  // someone switches view.
                  data-project-row={p.id}
                  onMouseDown={() => actions.focusRow(p.id)}
                  className={cn(
                    // Both names: group/row drives the sticky cell's own
                    // background, plain group is what the shared hover-reveal
                    // actions button looks for.
                    "group group/row cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2",
                    isContext && "opacity-55",
                    isSelected && "bg-brand-soft/40",
                    isFocused && "outline outline-2 -outline-offset-2 outline-brand"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 w-9 px-3 py-2 align-middle",
                      isSelected ? "bg-brand-soft/40" : "bg-surface group-hover/row:bg-surface-2"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectBox project={p} persistent />
                  </td>
                  {shown.map((col, i) => {
                    const sticky = i === 0;
                    const base = sticky
                      ? cn(stickyCell, isSelected && "bg-brand-soft/40")
                      : cellClass;
                    switch (col.key) {
                      case "title":
                        return (
                          <td key={col.key} className={base}>
                            {/* A real link so the row is keyboard reachable
                                and opens in a new tab on middle click. */}
                            <Link
                              href={`/${ws}/projects/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-body font-medium text-text-1 hover:underline"
                            >
                              {p.title}
                            </Link>
                          </td>
                        );
                      case "code":
                        return (
                          <td key={col.key} className={base}>
                            <CodeLabel code={p.code} />
                          </td>
                        );
                      case "list":
                        return (
                          <td key={col.key} className={base}>
                            {p.list_id ? listNames.get(p.list_id) ?? "" : ""}
                          </td>
                        );
                      case "status":
                        return (
                          <td key={col.key} className={base} onClick={(e) => e.stopPropagation()}>
                            {canEdit ? (
                              <select
                                aria-label={`Status for ${p.code}`}
                                value={p.status}
                                onChange={(e) =>
                                  actions.setStatus(p, e.target.value as ProjectStatus)
                                }
                                className="h-7 rounded-[8px] border border-border bg-surface px-1.5 text-meta text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
                              >
                                {PROJECT_STATUS_OPTIONS.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <ProjectStatusChip status={p.status} />
                            )}
                          </td>
                        );
                      case "assignee":
                        return (
                          <td key={col.key} className={base} onClick={(e) => e.stopPropagation()}>
                            {canEdit ? (
                              <select
                                aria-label={`Assignee for ${p.code}`}
                                value={p.owner_id ?? ""}
                                onChange={(e) => actions.setOwner(p, e.target.value || null)}
                                className="h-7 max-w-[150px] rounded-[8px] border border-border bg-surface px-1.5 text-meta text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
                              >
                                <option value="">Unassigned</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.full_name}
                                  </option>
                                ))}
                              </select>
                            ) : p.owner ? (
                              <span className="flex items-center gap-1.5">
                                <PersonAvatar
                                  name={p.owner.full_name}
                                  src={p.owner.avatar_url}
                                  size={20}
                                />
                                <span className="truncate">{p.owner.full_name}</span>
                              </span>
                            ) : (
                              <span className="text-text-3">Unassigned</span>
                            )}
                          </td>
                        );
                      case "due":
                        return (
                          <td key={col.key} className={base}>
                            <DueDate due={p.due_date} status={p.status} />
                          </td>
                        );
                      case "progress":
                        return (
                          <td key={col.key} className={base}>
                            <span className="flex items-center gap-2">
                              <ProgressRing
                                value={c.total > 0 ? c.done / c.total : 0}
                                size={26}
                              />
                              <span className="font-mono text-label text-text-3 tabular">
                                {c.done}/{c.total}
                              </span>
                            </span>
                          </td>
                        );
                      case "updated":
                        return (
                          <td key={col.key} className={base}>
                            <TimeAgo at={p.updated_at} />
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                  <td
                    className="w-10 px-2 py-2 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ProjectOverflowButton project={p} />
                  </td>
                </tr>
                </ProjectContextMenu>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
