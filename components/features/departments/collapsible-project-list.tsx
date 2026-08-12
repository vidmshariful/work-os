"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CornerDownRight, Layers } from "lucide-react";
import { Card } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel, CountBadge, DragHandle } from "@/components/primitives/misc";
import { DueDate } from "@/components/features/projects/due-date";
import {
  ProjectContextMenu,
  ProjectOverflowButton,
  SelectBox,
  useProjectActions,
} from "@/components/features/projects/project-actions";
import { cn } from "@/lib/utils";
import { Draggable, Droppable } from "./space-dnd";
import type {
  CompletionMap,
  ProjectWithOwner,
} from "@/components/features/projects/types";

// Wraps a row in exactly as much drag machinery as it needs. With drag off it
// renders the row untouched, which is how the list page keeps working with no
// DndContext anywhere above it.
function RowShell({
  project,
  draggable,
  droppable,
  children,
}: {
  project: ProjectWithOwner;
  draggable: boolean;
  droppable: boolean;
  children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  if (!draggable && !droppable) return <>{children({})}</>;

  const inner = draggable ? (
    <Draggable
      id={`project:${project.id}`}
      data={{
        kind: "project",
        id: project.id,
        parentId: project.parent_project_id,
      }}
    >
      {children}
    </Draggable>
  ) : (
    <>{children({})}</>
  );

  if (!droppable) return inner;
  return (
    <Droppable
      id={`row:${project.id}`}
      data={{ kind: "row", id: project.id }}
      activeClassName="ring-2 ring-inset ring-brand/50 rounded-[10px]"
    >
      {inner}
    </Droppable>
  );
}

// The order rows are drawn in, parents followed by their children. Selection
// needs this to resolve a shift-click range, and it has to come from the same
// function that lays the rows out or a range would skip or double up.
export function visualOrder(
  projects: ProjectWithOwner[],
  nested: boolean
): string[] {
  const { tops, subsByParent } = arrange(projects, nested);
  return tops.flatMap((p) => [
    p.id,
    ...(subsByParent.get(p.id) ?? []).map((s) => s.id),
  ]);
}

function arrange(projects: ProjectWithOwner[], nested: boolean) {
  const present = new Set(projects.map((p) => p.id));
  // A child whose parent is not in this same set has nowhere to nest, which
  // happens if someone moves a sub-project to another list or clears its list.
  // It is promoted to a top-level row rather than silently dropped. In flat
  // mode every project is a top-level row by definition.
  const tops = nested
    ? projects.filter(
        (p) => !p.parent_project_id || !present.has(p.parent_project_id)
      )
    : projects;
  const subsByParent = new Map<string, ProjectWithOwner[]>();
  for (const p of nested ? projects : []) {
    if (!p.parent_project_id || !present.has(p.parent_project_id)) continue;
    const arr = subsByParent.get(p.parent_project_id) ?? [];
    arr.push(p);
    subsByParent.set(p.parent_project_id, arr);
  }
  return { tops, subsByParent };
}

// Disclosure state lives per user, so two people sharing a browser do not
// inherit each other's open and closed parents.
const storageKeyFor = (userId: string) => `workos:subprojects:collapsed:${userId}`;

// The List view of a set of projects. Top-level projects are rows; a project
// with sub-projects gets a chevron that collapses its children. Used by both
// the list page and the space page, so nesting behaves the same in both.
// The list is a table, so the cells need fixed widths and a header saying
// what they are. ClickUp puts that header inside every group; so does this.
// Widths live here once because the header and the rows both read them, and
// a table whose header does not line up with its body is worse than no
// header at all.
// The same rounded corners a Card gives, without the border and background,
// for a list that is already inside one.
function PlainFrame({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[10px]">{children}</div>;
}

const COL = {
  // The select box, the drag handle and the expand arrow, at a fixed width so
  // the Name header sits over the titles instead of 68px to their left.
  lead: "w-[58px]",
  progress: "w-[20px]",
  assignee: "w-[104px]",
  due: "w-[104px]",
  status: "w-[104px]",
};

export function ProjectListHeader({ trailingRoom = true }: { trailingRoom?: boolean }) {
  return (
    // Same gaps and padding as a dense row, or the labels drift from the
    // columns they name by the difference between the two.
    <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-text-3">
      <span className={COL.lead} aria-hidden />
      <span className="min-w-0 flex-1">Name</span>
      <span className={COL.progress} aria-hidden />
      <span className={COL.assignee}>Assignee</span>
      <span className={COL.due}>Due date</span>
      <span className={COL.status}>Status</span>
      {/* Matches the width of the row's hover actions, so the four labels sit
          over their columns rather than one notch to the right. */}
      {trailingRoom ? <span className="w-[92px]" aria-hidden /> : null}
    </div>
  );
}

// A list inside a folder is already inside a bordered box, so it does not
// draw a second one around itself. Three nested boxes around one row, which
// is what a folder plus a section plus a card came to, reads as clutter
// rather than as structure.
export function CollapsibleProjectList({
  ws,
  userId,
  projects,
  completion,
  contextIds,
  forceExpanded = false,
  nested = true,
  parentOf,
  dragEnabled = false,
  canDrag,
  rowDroppable = false,
  footer,
  // False inside a folder, which supplies the border already.
  boxed = true,
}: {
  ws: string;
  userId: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
  // Parents present only because a child matched a filter. Dimmed, so they
  // read as context rather than as results.
  contextIds?: Set<string>;
  // While a filter is on, a collapsed parent would hide the very child the
  // filter found, so disclosure state is ignored until the filter clears.
  forceExpanded?: boolean;
  // Grouping by status or assignee can separate a child from its parent, so
  // nesting is switched off and every project becomes a top-level row.
  nested?: boolean;
  // Resolves a child's parent for the breadcrumb shown in flat mode. Built
  // from every project in the space, so it still resolves when the parent is
  // filtered out or sits in another group.
  parentOf?: Map<string, { id: string; code: string; title: string }>;
  // Drag is opt in. The list page passes nothing and stays static; the space
  // page turns it on for the groupings where a move has a clear meaning.
  dragEnabled?: boolean;
  // Per row, because projects_update allows a manager on any project or the
  // owner on their own. A handle that cannot move anything is a lie.
  canDrag?: (p: ProjectWithOwner) => boolean;
  // Whether a row accepts another project dropped onto it, which is how a
  // sub-project is made.
  rowDroppable?: boolean;
  // Rendered as the last thing inside the card, which is where the quick add
  // row lives so it reads as the next row rather than as a separate control.
  footer?: React.ReactNode;
  boxed?: boolean;
}) {
  // Pending menu and drag changes are folded in here, so a row reflects the
  // action the instant it is taken. Without a provider this is the identity.
  const actions = useProjectActions();
  const rows = actions ? actions.resolve(projects) : projects;
  const { tops, subsByParent } = arrange(rows, nested);

  // Starts empty on both server and client so the first paint matches, then
  // the stored set is applied once mounted.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState(false);
  const storageKey = storageKeyFor(userId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // A blocked or corrupt store just means everything stays expanded.
    }
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
    } catch {
      // Nothing to do: the view still works, it just will not be remembered.
    }
  }, [collapsed, restored, storageKey]);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function meta(p: ProjectWithOwner, sub: boolean) {
    const c = completion[p.id] ?? { done: 0, total: 0 };
    return (
      <>
        {/* Progress is a column, not the first thing in the row. A 32px ring
            in front of every title set the row height on its own and was the
            loudest thing on a screen of fifteen. Only drawn when the project
            actually has tasks. */}
        <span className={cn(COL.progress, "flex items-center")}>
          {c.total > 0 ? (
            // A quiet arc, no digits. At this size the number inside was two
            // characters of noise beside every avatar, and the exact figure
            // already lives on the project page and in the table view.
            <ProgressRing
              value={c.done / c.total}
              size={sub ? 14 : 16}
              strokeWidth={2.5}
              showLabel={false}
            />
          ) : null}
        </span>
        <span className={cn(COL.assignee, "flex items-center")}>
          {p.owner ? (
            <PersonAvatar
              name={p.owner.full_name}
              src={p.owner.avatar_url}
              size={sub ? 20 : 22}
            />
          ) : (
            <span className="text-[12.5px] text-text-3">Unassigned</span>
          )}
        </span>
        <span className={cn(COL.due, "flex items-center")}>
          <DueDate due={p.due_date} status={p.status} />
        </span>
        <span className={cn(COL.status, "flex items-center")}>
          <ProjectStatusChip status={p.status} />
        </span>
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

  // Right-click reaches the same menu the overflow button does. Both are no
  // ops without a provider, so the surfaces that have not adopted them are
  // untouched.
  function trailing(p: ProjectWithOwner) {
    return (
      <span className="flex w-[92px] items-center justify-end gap-1">
        <ProjectOverflowButton project={p} />
        {open(p.id)}
      </span>
    );
  }

  const Frame = boxed ? Card : PlainFrame;
  return (
    <Frame>
      <ProjectListHeader />
      {tops.map((p) => {
        const subs = subsByParent.get(p.id) ?? [];
        const hasSubs = subs.length > 0;
        const expanded = forceExpanded || !collapsed.has(p.id);
        const isContext = contextIds?.has(p.id) ?? false;
        const draggableHere = dragEnabled && (canDrag?.(p) ?? false);
        const selected = actions?.selected.has(p.id) ?? false;
        const focused = actions?.focusedId === p.id;
        const row = (
          <RowShell
            project={p}
            draggable={draggableHere}
            droppable={rowDroppable && !p.parent_project_id && !hasSubs}
          >
            {(handle) => (
            <ProjectContextMenu project={p}>
              <div
                data-project-row={p.id}
                onMouseDown={() => actions?.focusRow(p.id)}
                className={cn(
                  "scroll-mt-24 rounded-[10px]",
                  focused && "relative z-10 ring-2 ring-inset ring-brand"
                )}
              >
                <ListRow
                  className={cn(isContext && "opacity-55", selected && "bg-brand-soft/40")}
                  leading={
                    <div className={cn(COL.lead, "flex items-center gap-1")}>
                      <SelectBox project={p} />
                      {dragEnabled ? (
                        <span
                          {...(draggableHere ? handle : {})}
                          aria-hidden={!draggableHere}
                          className={cn("flex w-4 justify-center", !draggableHere && "invisible")}
                        >
                          <DragHandle />
                        </span>
                      ) : null}
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
                    </div>
                  }
                  dense
                  title={
                    <span className="flex min-w-0 items-baseline gap-2">
                      <Link
                        href={`/${ws}/projects/${p.id}`}
                        className="min-w-0 truncate hover:underline"
                      >
                        {p.title}
                      </Link>
                      {/* The code rides with the title rather than below it.
                          A second line doubled every row's height, which put
                          six projects on a screen that should hold fifteen. */}
                      <CodeLabel code={p.code} className="shrink-0" />
                      {/* In flat mode a child has no parent above it, so it says
                          where it belongs. */}
                      {!nested && p.parent_project_id && parentOf?.get(p.parent_project_id) ? (
                        <Link
                          href={`/${ws}/projects/${parentOf.get(p.parent_project_id)!.id}`}
                          className="flex min-w-0 items-center gap-1 text-text-3 hover:text-text-2"
                        >
                          <CornerDownRight className="size-3 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">
                            {parentOf.get(p.parent_project_id)!.title}
                          </span>
                        </Link>
                      ) : null}
                      {hasSubs ? (
                        <span className="flex items-center gap-1 text-text-3">
                          <Layers className="size-3.5" strokeWidth={1.5} />
                          <CountBadge count={subs.length} className="ml-0" />
                        </span>
                      ) : null}
                    </span>
                  }
                  meta={meta(p, false)}
                  trailing={trailing(p)}
                />
              </div>
            </ProjectContextMenu>
            )}
          </RowShell>
        );

        const children =
          hasSubs && expanded
            ? subs.map((s) => {
                const childDraggable = dragEnabled && (canDrag?.(s) ?? false);
                const childSelected = actions?.selected.has(s.id) ?? false;
                const childFocused = actions?.focusedId === s.id;
                return (
                  <RowShell key={s.id} project={s} draggable={childDraggable} droppable={false}>
                    {(handle) => (
                      <ProjectContextMenu project={s}>
                        <div
                          data-project-row={s.id}
                          onMouseDown={() => actions?.focusRow(s.id)}
                          className={cn(
                            "scroll-mt-24 rounded-[10px]",
                            childFocused && "relative z-10 ring-2 ring-inset ring-brand"
                          )}
                        >
                          <ListRow
                            className={cn(
                              "border-l-2 border-l-border bg-surface-2/40 pl-8",
                              childSelected && "bg-brand-soft/40"
                            )}
                            leading={
                              <span className="flex items-center gap-1">
                                <SelectBox project={s} />
                                {dragEnabled ? (
                                  <span
                                    {...(childDraggable ? handle : {})}
                                    aria-hidden={!childDraggable}
                                    className={cn(
                                      "flex w-4 justify-center",
                                      !childDraggable && "invisible"
                                    )}
                                  >
                                    <DragHandle />
                                  </span>
                                ) : null}
                              </span>
                            }
                            dense
                            title={
                              <span className="flex min-w-0 items-baseline gap-2">
                                <Link
                                  href={`/${ws}/projects/${s.id}`}
                                  className="min-w-0 truncate hover:underline"
                                >
                                  {s.title}
                                </Link>
                                <CodeLabel code={s.code} className="shrink-0" />
                              </span>
                            }
                            meta={meta(s, true)}
                            trailing={trailing(s)}
                          />
                        </div>
                      </ProjectContextMenu>
                    )}
                  </RowShell>
                );
              })
            : null;

        return (
          <div key={p.id}>
            {row}
            {children}
          </div>
        );
      })}
      {footer}
    </Frame>
  );
}
