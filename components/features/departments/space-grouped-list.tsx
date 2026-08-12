"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/primitives/card";
import { DragHandle } from "@/components/primitives/misc";
import { useProjectActionsRequired } from "@/components/features/projects/project-actions";
import { reorderLists } from "@/lib/actions/departments";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { cn } from "@/lib/utils";
import { CollapsibleProjectList, visualOrder } from "./collapsible-project-list";
import { FolderBlock } from "./folder-block";
import { ListSectionMenu, useListEdits } from "./list-controls";
import { QuickAddProject } from "./quick-add-project";
import { SpaceSection } from "./space-section";
import { Draggable, Droppable, preferInnermost, useSpaceSensors } from "./space-dnd";
import { NO_LIST, UNASSIGNED, type GroupKey } from "./space-filters";
import type { CompletionMap, ProjectWithOwner } from "@/components/features/projects/types";
import type { ProjectStatus } from "@/lib/types";

export interface SerialGroup {
  key: string;
  label: string;
  listId?: string;
  items: ProjectWithOwner[];
}

// Dragging only makes sense where dropping into a group means something. Due
// date buckets are computed from a date, and None has a single group, so a
// drop there would have nothing to change.
const DRAGGABLE_GROUPINGS: GroupKey[] = ["list", "status", "assignee"];

export function SpaceGroupedList({
  ws,
  slug,
  userId,
  groups,
  group,
  completion,
  contextIds,
  filterActive,
  nested,
  parentOf,
  canReorderLists,
  canManage,
  departmentId,
  lists,
  folders,
  listFolder,
  listCounts,
  spaces,
  sectionActions,
  emptyNote,
}: {
  ws: string;
  slug: string;
  userId: string;
  groups: SerialGroup[];
  group: GroupKey;
  completion: CompletionMap;
  contextIds: string[];
  filterActive: boolean;
  nested: boolean;
  parentOf: { id: string; code: string; title: string }[];
  // canAssignTasks. Governs reordering and every list edit.
  canReorderLists: boolean;
  // canCreateProjects. Governs quick add, and the list edits that rewrite
  // projects: move to another space, duplicate with projects.
  canManage: boolean;
  departmentId: string;
  lists: { id: string; name: string; color: string | null }[];
  // Folders in this space, in sort order. Empty means the space has none,
  // and the page renders exactly as it did before folders existed.
  folders: { id: string; name: string; color: string | null }[];
  // listId to folderId, null for a list sitting at the space root.
  listFolder: Record<string, string | null>;
  // Per list, counted across the whole space rather than the filtered view,
  // so the delete confirmation states what will really happen.
  listCounts: Record<string, number>;
  spaces: { id: string; name: string }[];
  // Rendered by the server for list groups: New project, Delete list.
  sectionActions?: Record<string, React.ReactNode>;
  emptyNote?: Record<string, string>;
}) {
  // Optimistic state, permissions, and every mutation live in the provider,
  // so a drop and a menu item take exactly the same path.
  const actions = useProjectActionsRequired();
  const listEdits = useListEdits({ ws, slug });
  const sensors = useSpaceSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  // A local order for the sections themselves. Projects are not tracked here:
  // the provider holds those.
  const [order, setOrder] = useState<string[] | null>(null);

  const contextSet = useMemo(() => new Set(contextIds), [contextIds]);
  const parentMap = useMemo(
    () => new Map(parentOf.map((p) => [p.id, p])),
    [parentOf]
  );
  const dragOn = DRAGGABLE_GROUPINGS.includes(group);

  // Which group a project belongs to once its pending changes are applied.
  const groupKeyOf = (p: ProjectWithOwner): string => {
    if (group === "list") return p.list_id ?? NO_LIST;
    if (group === "status") return p.status;
    if (group === "assignee") return p.owner_id ?? UNASSIGNED;
    return "";
  };

  // Rebuild the server's groups with pending changes folded in, so a row
  // jumps sections the instant it is dropped.
  const shown = useMemo(() => {
    const patched = actions.resolve(groups.flatMap((g) => g.items));
    const base = groups
      // A list deleted a moment ago is gone from the page before the server
      // confirms it, and comes back if the delete is refused.
      .filter((g) => !(g.listId && listEdits.gone.has(g.listId)))
      .map((g) => ({
        ...g,
        // A pending rename shows on the header it was typed into.
        label: (g.listId && listEdits.patches[g.listId]?.name) || g.label,
        items: [] as ProjectWithOwner[],
      }));
    const byKey = new Map(base.map((g) => [g.key, g]));
    // Where the server originally put each project, used when the grouping
    // is not one a drop can change.
    const origin = new Map<string, string>();
    for (const g of groups) for (const p of g.items) origin.set(p.id, g.key);

    for (const p of patched) {
      const target = dragOn ? groupKeyOf(p) : origin.get(p.id);
      // Deleting a list does not delete its work, so the rows land in
      // Unlisted straight away rather than blinking out and back.
      const home =
        (target ? byKey.get(target) : undefined) ?? byKey.get(NO_LIST) ?? base[0];
      home?.items.push(p);
    }
    return order
      ? [...base].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, actions.resolve, order, group, dragOn, listEdits.gone, listEdits.patches]);

  // The order shift-click ranges are resolved against. Grouping and pending
  // moves both change it, so it comes from what is actually on screen rather
  // than from the server's ordering.
  const flat = useMemo(
    () => shown.flatMap((g) => visualOrder(g.items, nested).map((id) => ({ id, g }))),
    [shown, nested]
  );
  const allProjects = useMemo(() => shown.flatMap((g) => g.items), [shown]);
  const { registerRows } = actions;
  useEffect(() => {
    const byId = new Map(allProjects.map((p) => [p.id, p]));
    registerRows(
      flat.map(({ id }) => byId.get(id)).filter((p): p is ProjectWithOwner => Boolean(p))
    );
  }, [flat, allProjects, registerRows]);
  // Switching to Table or Board hands ordering back, so a stale grouped order
  // does not outlive the view that produced it.
  useEffect(() => () => registerRows(null), [registerRows]);

  const active = activeId ? allProjects.find((p) => p.id === activeId) ?? null : null;

  const reorder = (fromKey: string, toKey: string) => {
    const keys = shown.map((g) => g.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...keys];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    const listIds = next
      .map((k) => shown.find((g) => g.key === k)?.listId)
      .filter((v): v is string => Boolean(v));
    void reorderLists(ws, slug, listIds).then((res) => {
      if (res.error) {
        setOrder(null);
        toast.error(res.error);
      }
    });
  };

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { kind: string; id: string } | undefined;
    setActiveId(d?.kind === "project" ? d.id : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const from = e.active.data.current as
      | { kind: string; id: string; parentId?: string | null }
      | undefined;
    const to = e.over?.data.current as { kind: string; id: string } | undefined;
    if (!from || !to) return;

    if (from.kind === "section" && to.kind === "section") {
      reorder(from.id, to.id);
      return;
    }
    if (from.kind !== "project") return;

    const p = allProjects.find((x) => x.id === from.id);
    if (!p) return;

    // Dropped onto another project: make it a sub-project. The action states
    // the reason when the one-level rule refuses.
    if (to.kind === "row") {
      if (to.id === p.id) return;
      actions.setParent(p, to.id);
      return;
    }

    if (to.kind !== "group") return;
    // Dropping into a group body promotes a child back to top level, which is
    // the gesture for dragging one out of its parent.
    if (p.parent_project_id) actions.setParent(p, null);
    if (group === "list") {
      const g = shown.find((x) => x.key === to.id);
      actions.setList(p, g?.listId ?? null);
    } else if (group === "status") {
      actions.setStatus(p, to.id as ProjectStatus);
    } else if (group === "assignee") {
      actions.setOwner(p, to.id === UNASSIGNED ? null : to.id);
    }
  }

  // Sections carry no folder of their own, so they are bucketed here. Only
  // grouping by list has folders at all: grouping by status or assignee cuts
  // across them, and a folder header over a status column would be a lie.
  const blocks = useMemo(() => {
    const indexed = shown.map((g, i) => ({ g, i }));
    if (group !== "list" || folders.length === 0) {
      return [{ key: "__all", folder: null, groups: indexed }];
    }
    const out: {
      key: string;
      folder: { id: string; name: string; color: string | null } | null;
      groups: { g: (typeof shown)[number]; i: number }[];
    }[] = [];
    for (const f of folders) {
      const mine = indexed.filter(({ g }) => g.listId && listFolder[g.listId] === f.id);
      // An empty folder still draws, so it is somewhere to drop a list into
      // rather than something that vanishes the moment it is emptied.
      out.push({ key: `folder:${f.id}`, folder: f, groups: mine });
    }
    const loose = indexed.filter(
      ({ g }) => !g.listId || !listFolder[g.listId]
    );
    if (loose.length > 0) out.push({ key: "__loose", folder: null, groups: loose });
    return out;
  }, [shown, group, folders, listFolder]);

  const canReorder = group === "list" && canReorderLists;

  return (
    <DndContext
      // A stable id, because dnd-kit otherwise numbers its contexts from a
      // module counter that has already been running on the server and starts
      // again at zero in the browser. The aria-describedby it hands to every
      // drag handle then differs between the two, React reports a hydration
      // mismatch and throws the server's markup away for this whole tree.
      id="space-grouped-list"
      sensors={sensors}
      collisionDetection={preferInnermost}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col gap-5">
        {blocks.map((block) => (
          <FolderBlock
            key={block.key}
            ws={ws}
            slug={slug}
            folder={block.folder}
            listCount={block.groups.length}
            canEdit={canReorderLists}
            // Only when nothing is filtered: with a filter on, an empty
            // folder means "nothing matched here", and shutting it would
            // hide that answer.
            startCollapsed={
              !filterActive &&
              block.groups.every(({ g }) => g.items.length === 0)
            }
          >
        {block.groups.map(({ g, i }) => {
          const alwaysShow = group === "list" && g.key === NO_LIST;
          if (filterActive && g.items.length === 0 && !alwaysShow) return null;
          if (g.items.length === 0 && !alwaysShow && group !== "list") return null;

          // Quick add belongs to a list section, because that is the only
          // grouping where "add it here" names a place to put it. Under
          // status or due date the section is a computed property of the
          // project, not somewhere work can be filed.
          const quickAdd =
            group === "list" && canManage ? (
              <QuickAddProject
                ws={ws}
                slug={slug}
                departmentId={departmentId}
                listId={g.listId ?? null}
                listName={g.label}
              />
            ) : null;

          const body = (
            <Droppable
              id={`group:${g.key}`}
              data={{ kind: "group", id: g.key }}
              disabled={!dragOn}
              activeClassName="rounded-[14px] ring-2 ring-brand/40"
            >
              {g.items.length === 0 ? (
                // A section standing empty is a smaller thing than a space
                // standing empty, so it gets a line and the quick add row
                // rather than a full empty state. The action is right there:
                // type a title into the row below.
                <Card className={cn(block.folder !== null && "border-0 bg-transparent shadow-none")}>
                  <p className="px-5 py-4 text-[12.5px] text-text-3">
                    {emptyNote?.[g.key] ??
                      (quickAdd
                        ? `Nothing in ${g.label} yet. Add the first project below.`
                        : `Nothing in ${g.label} yet.`)}
                  </p>
                  {quickAdd}
                </Card>
              ) : (
                <CollapsibleProjectList
                  boxed={block.folder === null}
                  showStatus={group !== "status"}
                  ws={ws}
                  userId={userId}
                  projects={g.items}
                  completion={completion}
                  contextIds={contextSet}
                  forceExpanded={filterActive}
                  nested={nested}
                  parentOf={parentMap}
                  dragEnabled={dragOn}
                  canDrag={actions.canEdit}
                  rowDroppable={group === "list"}
                  footer={quickAdd}
                />
              )}
            </Droppable>
          );

          // The Unlisted section is not a list, so it has nothing to rename,
          // recolour, move, duplicate, or delete.
          const listRow = g.listId
            ? {
                id: g.listId,
                name: g.label,
                color:
                  listEdits.patches[g.listId]?.color !== undefined
                    ? listEdits.patches[g.listId].color ?? null
                    : lists.find((l) => l.id === g.listId)?.color ?? null,
              }
            : null;

          const header = (
            <SpaceSection
              anchorId={g.listId ? `list-${g.listId}` : undefined}
              label={g.label}
              // Grouped by status, the header is the status itself, so it is
              // drawn as the same chip the rows would carry rather than as a
              // heading that happens to read "In progress".
              chip={
                group === "status" ? (
                  <ProjectStatusChip status={g.key as ProjectStatus} />
                ) : undefined
              }
              count={g.items.length}
              color={listRow?.color}
              renaming={Boolean(listRow) && listEdits.renamingId === listRow!.id}
              onRename={(name) => listEdits.rename(listRow!.id, name)}
              onRenameCancel={listEdits.cancelRename}
              actions={
                <>
                  {listRow && canReorderLists ? (
                    <ListSectionMenu
                      list={listRow}
                      projectCount={listCounts[listRow.id] ?? 0}
                      spaces={spaces}
                      currentSpaceId={departmentId}
                      folders={folders.map((f) => ({ id: f.id, name: f.name }))}
                      currentFolderId={listFolder[listRow.id] ?? null}
                      canManage={canManage}
                      onStartRename={() => listEdits.startRename(listRow.id)}
                      onSetColor={(color) => listEdits.setColor(listRow.id, color)}
                      onMove={(deptId, name) => listEdits.move(listRow.id, deptId, name)}
                      onRefile={(folderId, name) =>
                        listEdits.refile(listRow.id, folderId, name)
                      }
                      onArchive={() => listEdits.archive(listRow.id, listRow.name)}
                      onDuplicate={(withProjects) =>
                        listEdits.duplicate(listRow.id, withProjects)
                      }
                      onDelete={() => listEdits.remove(listRow.id)}
                    />
                  ) : null}
                  {/* Keyboard path for section reorder. */}
                  {canReorder && g.listId ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${g.label} earlier`}
                        disabled={i === 0}
                        onClick={() => reorder(g.key, shown[i - 1]?.key)}
                        className="rounded-[6px] p-1 text-text-3 hover:text-text-1 disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${g.label} later`}
                        disabled={i === shown.length - 1 || !shown[i + 1]?.listId}
                        onClick={() => reorder(g.key, shown[i + 1]?.key)}
                        className="rounded-[6px] p-1 text-text-3 hover:text-text-1 disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" strokeWidth={2} />
                      </button>
                    </>
                  ) : null}
                  {sectionActions?.[g.key]}
                </>
              }
            >
              {body}
            </SpaceSection>
          );

          if (!canReorder || !g.listId) return <div key={g.key}>{header}</div>;

          return (
            <Droppable
              key={g.key}
              id={`section:${g.key}`}
              data={{ kind: "section", id: g.key }}
              activeClassName="rounded-[14px] ring-2 ring-brand/40"
            >
              <Draggable id={`section-drag:${g.key}`} data={{ kind: "section", id: g.key }}>
                {(handle) => (
                  <div className="group/section-drag">
                    <span
                      {...handle}
                      aria-label={`Reorder ${g.label}`}
                      className="mb-0.5 flex w-4 justify-center"
                    >
                      <DragHandle className="group-hover/section-drag:opacity-100" />
                    </span>
                    {header}
                  </div>
                )}
              </Draggable>
            </Droppable>
          );
        })}
          </FolderBlock>
        ))}
      </div>

      <DragOverlay>
        {active ? (
          <div className="rounded-[12px] border border-border bg-surface px-3 py-2 text-[13px] font-medium text-text-1 shadow-[var(--shadow-pop)]">
            {active.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
