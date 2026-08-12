"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRightLeft,
  CalendarDays,
  Check,
  Copy,
  CornerDownRight,
  ExternalLink,
  Flag,
  Hash,
  Link2,
  MoreHorizontal,
  SquareStack,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  setProjectDepartment,
  setProjectDueDate,
  setProjectList,
  setProjectOwner,
  setProjectParent,
  setProjectPriority,
  updateProjectStatus,
} from "@/lib/actions/projects";
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS } from "./types";
import type { CompletionMap, MemberOption, ProjectWithOwner } from "./types";
import type { ProjectStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export interface ProjectActionsScope {
  ws: string;
  viewerId: string;
  // canCreateProjects. projects_update permits a manager on any project, or
  // the owner on their own, so edit rights are decided per row, never once
  // for the page.
  canManage: boolean;
  // Mirrors projects_delete, which is executive only.
  canDelete: boolean;
  // Lists in the space being viewed. Empty on surfaces that span spaces.
  lists: { id: string; name: string }[];
  // Spaces this reader can file work into.
  spaces: { id: string; name: string }[];
  members: MemberOption[];
}

type Outcome = { error: string | null };

interface Optimistic {
  patch?: Partial<ProjectWithOwner>;
  // Rows that leave the current surface: archived, deleted, moved to another
  // space. Hiding them is the honest optimistic result.
  hide?: boolean;
}

interface ProjectActionsValue extends ProjectActionsScope {
  // Folds pending changes into a server-rendered set and drops rows that have
  // left the surface. Every view calls this before it draws.
  resolve: (rows: ProjectWithOwner[]) => ProjectWithOwner[];
  canEdit: (p: ProjectWithOwner) => boolean;
  // The one optimistic path. Drag and drop uses it too, so a dropped row and
  // a menu item behave identically, including the rollback.
  run: (id: string, optimistic: Optimistic, call: () => Promise<Outcome>) => void;

  // Selection
  rows: ProjectWithOwner[];
  registerRows: (rows: ProjectWithOwner[] | null) => void;
  selected: Set<string>;
  selectRow: (
    id: string,
    modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => void;
  // Replaces the whole selection, which is what a select-all header does.
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;

  // Keyboard navigation. One row at a time carries the focus ring, moved with
  // j and k or the arrow keys, and every row action has a key behind it.
  focusedId: string | null;
  focusRow: (id: string | null) => void;
  showShortcuts: () => void;

  // Single-row actions, shared by the context menu and the overflow button.
  setStatus: (p: ProjectWithOwner, status: ProjectStatus) => void;
  setPriority: (p: ProjectWithOwner, priority: number) => void;
  setOwner: (p: ProjectWithOwner, ownerId: string | null) => void;
  setList: (p: ProjectWithOwner, listId: string | null) => void;
  setSpace: (p: ProjectWithOwner, departmentId: string) => void;
  setParent: (p: ProjectWithOwner, parentId: string | null) => void;
  duplicate: (p: ProjectWithOwner) => void;
  archive: (p: ProjectWithOwner) => void;
  askDueDate: (p: ProjectWithOwner) => void;
  askDelete: (ids: string[]) => void;
  // Candidates for "Make sub-project of": top level, childless, not itself.
  parentsFor: (p: ProjectWithOwner) => ProjectWithOwner[];
}

const ProjectActionsContext = createContext<ProjectActionsValue | null>(null);

export function useProjectActions(): ProjectActionsValue | null {
  return useContext(ProjectActionsContext);
}

// For views that only ever render inside the provider.
export function useProjectActionsRequired(): ProjectActionsValue {
  const value = useContext(ProjectActionsContext);
  if (!value) {
    throw new Error("This view must render inside ProjectActionsProvider.");
  }
  return value;
}

export const DELETE_DENIED = "Only executives can delete projects.";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ProjectActionsProvider({
  scope,
  rows: serverRows,
  children,
}: {
  scope: ProjectActionsScope;
  // The visible set in server order. Views that reorder client-side, such as
  // the grouped list, register their own order on top of this.
  rows: ProjectWithOwner[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [patches, setPatches] = useState<Record<string, Partial<ProjectWithOwner>>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [registered, setRegistered] = useState<ProjectWithOwner[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueTarget, setDueTarget] = useState<ProjectWithOwner | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const anchor = useRef<string | null>(null);
  // Where the ring was in the visual order, so collapsing a group or
  // tightening a filter puts it somewhere sensible instead of losing it.
  const focusIndex = useRef(0);
  // The key handler is registered before selectRow is defined, and re-binding
  // the listener on every selection change would be wasteful, so it reaches
  // the current one through a ref.
  const selectRowRef = useRef<
    (id: string, m: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  >(() => {});

  const resolve = useCallback(
    (input: ProjectWithOwner[]) =>
      input
        .filter((p) => !hidden.has(p.id))
        .map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p)),
    [hidden, patches]
  );

  const rows = useMemo(
    () => resolve(registered ?? serverRows),
    [registered, serverRows, resolve]
  );

  // Null hands ordering back to the server's list, which is what a view does
  // when it unmounts. Rows are compared by identity, not by id, so a rolled
  // back change replaces the stale objects instead of being missed.
  const registerRows = useCallback((next: ProjectWithOwner[] | null) => {
    setRegistered((prev) => {
      if (next === null) return null;
      if (prev && prev.length === next.length && prev.every((p, i) => p === next[i])) {
        return prev;
      }
      return next;
    });
  }, []);

  // Selection survives a filter change, but only for rows that survived it
  // too. Acting on a row the person can no longer see is a footgun, so the
  // rest are dropped and the drop is reported rather than done quietly.
  const visibleKey = rows.map((p) => p.id).join(",");
  const firstPass = useRef(true);
  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split(",") : []);
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const kept = new Set([...prev].filter((id) => visible.has(id)));
      const dropped = prev.size - kept.size;
      if (dropped === 0) return prev;
      if (!firstPass.current) {
        toast.info(
          dropped === 1
            ? "1 selected project is no longer visible, so it was dropped from the selection."
            : `${dropped} selected projects are no longer visible, so they were dropped from the selection.`
        );
      }
      return kept;
    });
    firstPass.current = false;
  }, [visibleKey]);

  // The ring follows the row, not the index, but the index is what makes it
  // survive a group collapsing or a filter cutting the list: when the focused
  // row goes away, the nearest surviving position takes over rather than the
  // ring vanishing and the person losing their place.
  const rowIds = rows.map((p) => p.id);
  const rowKey = rowIds.join(",");
  useEffect(() => {
    const ids = rowKey ? rowKey.split(",") : [];
    setFocusedId((current) => {
      if (current && ids.includes(current)) {
        focusIndex.current = ids.indexOf(current);
        return current;
      }
      if (current === null) return null;
      if (ids.length === 0) return null;
      const next = ids[Math.min(focusIndex.current, ids.length - 1)];
      focusIndex.current = ids.indexOf(next);
      return next;
    });
  }, [rowKey]);

  // The rows a person can actually see, top to bottom, read from the page
  // rather than from state.
  //
  // This has to come from the DOM. A section collapses inside SpaceSection
  // and a parent's sub-projects collapse inside CollapsibleProjectList, and
  // both unmount their rows without anything telling this provider. Walking
  // the registered order instead would step the ring into rows that are not
  // on screen, which is the opposite of focus being visible. Falling back to
  // the registered order covers a view that draws no anchors at all.
  const navigableIds = useCallback((): string[] => {
    const drawn = document.querySelectorAll<HTMLElement>("[data-project-row]");
    if (drawn.length > 0) {
      return [...drawn]
        .map((el) => el.getAttribute("data-project-row"))
        .filter((id): id is string => Boolean(id));
    }
    return rows.map((p) => p.id);
  }, [rows]);

  const focusRow = useCallback(
    (id: string | null) => {
      setFocusedId(id);
      if (!id) return;
      const at = rows.findIndex((p) => p.id === id);
      if (at >= 0) focusIndex.current = at;
      // Moving the ring off screen is the same as losing it.
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-project-row="${id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    },
    [rows]
  );

  // One listener for the whole page. Everything below is a shortcut for
  // something the mouse can already do, so nothing here is the only way to
  // reach an action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;
      // A menu, popover, or dialog owns the keyboard while it is open. Radix
      // handles arrows and Escape inside them, and fighting it would break
      // the menus this page depends on.
      const layerOpen = Boolean(
        document.querySelector("[data-radix-popper-content-wrapper], [role='dialog']")
      );

      if (e.key === "Escape") {
        if (layerOpen || typing) return;
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        setSelected((prev) => (prev.size === 0 ? prev : new Set()));
        return;
      }

      if (layerOpen) return;

      // "/" reaches the search box from anywhere, which is the one shortcut
      // that has to work while the ring is nowhere in particular.
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        const box = document.querySelector<HTMLInputElement>("[data-space-search]");
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
        return;
      }
      if (typing) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }

      const ids = navigableIds();
      if (ids.length === 0) return;
      const at = focusedId ? ids.indexOf(focusedId) : -1;

      const move = (delta: number) => {
        e.preventDefault();
        // With no ring yet, the first press lands on the first row going
        // down and the last row going up. When the focused row has been
        // collapsed away, the remembered position is where the ring picks
        // up, so a collapse costs you one keypress and not your place.
        const from = at < 0 ? Math.min(focusIndex.current, ids.length - 1) - delta : at;
        const next =
          at < 0 && focusedId === null
            ? delta > 0
              ? 0
              : ids.length - 1
            : Math.min(ids.length - 1, Math.max(0, from + delta));
        focusRow(ids[next]);
      };

      if (e.key === "j" || e.key === "ArrowDown") return move(1);
      if (e.key === "k" || e.key === "ArrowUp") return move(-1);
      if (at < 0) return;
      const focused = rows.find((p) => p.id === ids[at]);
      if (!focused) return;

      if (e.key === "Enter") {
        e.preventDefault();
        const href = `/${scope.ws}/projects/${focused.id}`;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
        else router.push(href);
        return;
      }
      if (e.key === "x") {
        e.preventDefault();
        selectRowRef.current(focused.id, {
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
        });
        return;
      }
      if (e.key === "e") {
        e.preventDefault();
        // The menu lives in the row, and Radix opens it on a real click, so
        // this presses the same button the mouse would.
        document
          .querySelector<HTMLButtonElement>(`[data-row-menu="${focused.id}"]`)
          ?.click();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusRow, focusedId, helpOpen, navigableIds, rows, router, scope.ws]);

  const applyOptimistic = useCallback((id: string, o: Optimistic) => {
    if (o.patch) setPatches((m) => ({ ...m, [id]: { ...(m[id] ?? {}), ...o.patch } }));
    if (o.hide) setHidden((s) => new Set(s).add(id));
  }, []);

  const rollback = useCallback((id: string, o: Optimistic) => {
    if (o.patch) {
      setPatches((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
    if (o.hide) {
      setHidden((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const runAsync = useCallback(
    async (id: string, o: Optimistic, call: () => Promise<Outcome>): Promise<Outcome> => {
      applyOptimistic(id, o);
      const res = await call();
      if (res.error) rollback(id, o);
      return res;
    },
    [applyOptimistic, rollback]
  );

  const run = useCallback(
    (id: string, o: Optimistic, call: () => Promise<Outcome>) => {
      void runAsync(id, o, call).then((res) => {
        if (res.error) toast.error(res.error);
      });
    },
    [runAsync]
  );

  const canEdit = useCallback(
    (p: ProjectWithOwner) => scope.canManage || p.owner_id === scope.viewerId,
    [scope.canManage, scope.viewerId]
  );

  // ---- single row ----

  const setStatus = useCallback(
    (p: ProjectWithOwner, status: ProjectStatus) => {
      if (p.status === status) return;
      run(p.id, { patch: { status } }, () => updateProjectStatus(scope.ws, p.id, status));
    },
    [run, scope.ws]
  );

  const setPriority = useCallback(
    (p: ProjectWithOwner, priority: number) => {
      if ((p.priority ?? 0) === priority) return;
      run(p.id, { patch: { priority } }, () => setProjectPriority(scope.ws, p.id, priority));
    },
    [run, scope.ws]
  );

  const setOwner = useCallback(
    (p: ProjectWithOwner, ownerId: string | null) => {
      if (p.owner_id === ownerId) return;
      const member = scope.members.find((m) => m.id === ownerId);
      run(
        p.id,
        {
          patch: {
            owner_id: ownerId,
            owner: member
              ? { id: member.id, full_name: member.full_name, avatar_url: null }
              : null,
          },
        },
        () => setProjectOwner(scope.ws, p.id, ownerId)
      );
    },
    [run, scope.members, scope.ws]
  );

  const setList = useCallback(
    (p: ProjectWithOwner, listId: string | null) => {
      if (p.list_id === listId) return;
      run(p.id, { patch: { list_id: listId } }, () =>
        setProjectList(scope.ws, p.id, listId)
      );
    },
    [run, scope.ws]
  );

  const setSpace = useCallback(
    (p: ProjectWithOwner, departmentId: string) => {
      if (p.department_id === departmentId) return;
      // It leaves this space, so it leaves this screen. list_id is cleared by
      // updateProject, which is the one place that rule lives.
      run(p.id, { hide: true }, () => setProjectDepartment(scope.ws, p.id, departmentId));
    },
    [run, scope.ws]
  );

  const setParent = useCallback(
    (p: ProjectWithOwner, parentId: string | null) => {
      if (p.parent_project_id === parentId) return;
      run(p.id, { patch: { parent_project_id: parentId } }, () =>
        setProjectParent(scope.ws, p.id, parentId)
      );
    },
    [run, scope.ws]
  );

  const archive = useCallback(
    (p: ProjectWithOwner) => {
      run(p.id, { hide: true }, () => archiveProject(scope.ws, p.id));
    },
    [run, scope.ws]
  );

  const duplicate = useCallback(
    (p: ProjectWithOwner) => {
      // No optimistic row: the copy's code comes from the database, and
      // inventing one would put a wrong code on screen.
      void duplicateProject(scope.ws, p.id).then((res) => {
        if (res.error) toast.error(res.error);
        else {
          toast.success(`${p.code} duplicated.`);
          router.refresh();
        }
      });
    },
    [router, scope.ws]
  );

  const parentsFor = useCallback(
    (p: ProjectWithOwner) =>
      rows.filter(
        (x) =>
          x.id !== p.id &&
          !x.parent_project_id &&
          !rows.some((k) => k.parent_project_id === x.id)
      ),
    [rows]
  );

  // ---- selection ----

  const selectRow = useCallback(
    (
      id: string,
      modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
    ) => {
      // Same order the ring walks, for the same reason: a shift range that
      // swept up rows hidden inside a collapsed section would select work
      // the person cannot see.
      const order = navigableIds();
      setSelected((prev) => {
        const next = new Set(prev);
        if (modifiers.shiftKey && anchor.current) {
          const from = order.indexOf(anchor.current);
          const to = order.indexOf(id);
          if (from >= 0 && to >= 0) {
            const [lo, hi] = from <= to ? [from, to] : [to, from];
            for (let i = lo; i <= hi; i++) next.add(order[i]);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // Cmd or Ctrl click toggles one row and moves the anchor with it; a
      // plain click does the same. Shift extends from wherever the anchor is
      // and leaves it there, so a second shift-click re-extends rather than
      // starting over.
      if (!modifiers.shiftKey) anchor.current = id;
    },
    [navigableIds]
  );

  selectRowRef.current = selectRow;

  const setSelection = useCallback((ids: string[]) => setSelected(new Set(ids)), []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // ---- bulk ----

  const selectedRows = useMemo(
    () => rows.filter((p) => selected.has(p.id)),
    [rows, selected]
  );

  // Every bulk action reports what it actually did. Rows the reader cannot
  // write are skipped before the round trip rather than sent and refused.
  const bulk = useCallback(
    async (
      targets: ProjectWithOwner[],
      verb: string,
      optimisticFor: (p: ProjectWithOwner) => Optimistic,
      callFor: (p: ProjectWithOwner) => Promise<Outcome>
    ) => {
      const skipped = targets.length - targets.filter(canEdit).length;
      const doable = targets.filter(canEdit);
      if (doable.length === 0) {
        toast.error("None of the selected projects are yours to change.");
        return;
      }
      const results = await Promise.all(
        doable.map((p) => runAsync(p.id, optimisticFor(p), () => callFor(p)))
      );
      const failed = results.filter((r) => r.error);
      const ok = results.length - failed.length;
      if (failed.length === 0 && skipped === 0) {
        toast.success(`${ok} project${ok === 1 ? "" : "s"} ${verb}.`);
      } else {
        const parts = [`${ok} ${verb}`];
        if (skipped > 0) parts.push(`${skipped} not yours to change`);
        if (failed.length > 0) parts.push(`${failed.length} refused: ${failed[0].error}`);
        toast.error(parts.join(", ") + ".");
      }
      setSelected(new Set());
    },
    [canEdit, runAsync]
  );

  const askDueDate = useCallback((p: ProjectWithOwner) => setDueTarget(p), []);
  const askDelete = useCallback((ids: string[]) => setDeleteIds(ids), []);

  const confirmDelete = useCallback(async () => {
    const ids = deleteIds ?? [];
    setDeleteIds(null);
    const results = await Promise.all(
      ids.map((id) => runAsync(id, { hide: true }, () => deleteProject(scope.ws, id)))
    );
    const failed = results.filter((r) => r.error);
    if (failed.length === 0) {
      toast.success(
        ids.length === 1 ? "Project deleted." : `${ids.length} projects deleted.`
      );
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(failed[0].error ?? "Could not delete.");
    }
  }, [deleteIds, router, runAsync, scope.ws]);

  const value: ProjectActionsValue = {
    ...scope,
    resolve,
    canEdit,
    run,
    rows,
    registerRows,
    selected,
    selectRow,
    setSelection,
    clearSelection,
    focusedId,
    focusRow,
    showShortcuts: () => setHelpOpen(true),
    setStatus,
    setPriority,
    setOwner,
    setList,
    setSpace,
    setParent,
    duplicate,
    archive,
    askDueDate,
    askDelete,
    parentsFor,
  };

  return (
    <ProjectActionsContext.Provider value={value}>
      {children}
      <BulkBar
        count={selected.size}
        rows={selectedRows}
        scope={scope}
        onStatus={(s) =>
          void bulk(selectedRows, "moved", () => ({ patch: { status: s } }), (p) =>
            updateProjectStatus(scope.ws, p.id, s)
          )
        }
        onOwner={(ownerId) => {
          const member = scope.members.find((m) => m.id === ownerId);
          void bulk(
            selectedRows,
            "reassigned",
            () => ({
              patch: {
                owner_id: ownerId,
                owner: member
                  ? { id: member.id, full_name: member.full_name, avatar_url: null }
                  : null,
              },
            }),
            (p) => setProjectOwner(scope.ws, p.id, ownerId)
          );
        }}
        onList={(listId) =>
          void bulk(selectedRows, "moved", () => ({ patch: { list_id: listId } }), (p) =>
            setProjectList(scope.ws, p.id, listId)
          )
        }
        onArchive={() =>
          void bulk(selectedRows, "archived", () => ({ hide: true }), (p) =>
            archiveProject(scope.ws, p.id)
          )
        }
        onDelete={() => askDelete(selectedRows.map((p) => p.id))}
        onClear={clearSelection}
      />
      <DueDateDialog
        project={dueTarget}
        onClose={() => setDueTarget(null)}
        onSave={(value) => {
          const p = dueTarget;
          setDueTarget(null);
          if (!p) return;
          run(p.id, { patch: { due_date: value } }, () =>
            setProjectDueDate(scope.ws, p.id, value)
          );
        }}
      />
      <DeleteDialog
        ids={deleteIds}
        rows={rows}
        onClose={() => setDeleteIds(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </ProjectActionsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["j", "or", "Down"], what: "Move the focus ring down a row" },
  { keys: ["k", "or", "Up"], what: "Move the focus ring up a row" },
  { keys: ["Enter"], what: "Open the focused project" },
  { keys: ["Cmd", "Enter"], what: "Open the focused project in a new tab" },
  { keys: ["x"], what: "Select or deselect the focused row" },
  { keys: ["e"], what: "Open the focused row's menu" },
  { keys: ["/"], what: "Jump to search" },
  { keys: ["Esc"], what: "Leave search, or clear the selection" },
  { keys: ["?"], what: "Show or hide this list" },
];

// A shortcut nobody knows about is not a feature. This sits at the end of the
// control bar so the overlay has a way in that is not itself a shortcut.
export function ShortcutsHint({ className }: { className?: string }) {
  const a = useProjectActions();
  if (!a) return null;
  return (
    <button
      type="button"
      onClick={a.showShortcuts}
      aria-label="Show keyboard shortcuts"
      title="Keyboard shortcuts"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-border font-mono text-[12px] font-semibold text-text-3 transition-colors hover:text-text-1",
        className
      )}
    >
      ?
    </button>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  if (children === "or") {
    return <span className="px-0.5 text-[11px] text-text-3">or</span>;
  }
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-surface-2 px-1.5 font-mono text-[11px] font-medium text-text-2">
      {children}
    </kbd>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These work on the list view of a space. Every one of them is a
            shortcut for something you can also click.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.what} className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-text-2">{s.what}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <Key key={`${k}-${i}`}>{k}</Key>
                ))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// One menu, two shells
// ---------------------------------------------------------------------------
// The right-click menu and the overflow button must offer exactly the same
// things, so the item list is written once and rendered through whichever
// primitive is hosting it.

interface ItemProps {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  asChild?: boolean;
  variant?: "default" | "destructive";
  onSelect?: (event: Event) => void;
}
interface PanelProps {
  children?: React.ReactNode;
  className?: string;
}

interface MenuKit {
  Item: React.ComponentType<ItemProps>;
  Label: React.ComponentType<PanelProps>;
  Separator: React.ComponentType<{ className?: string }>;
  Sub: React.ComponentType<PanelProps>;
  SubTrigger: React.ComponentType<ItemProps>;
  SubContent: React.ComponentType<PanelProps>;
}

const DROPDOWN_KIT: MenuKit = {
  Item: DropdownMenuItem as React.ComponentType<ItemProps>,
  Label: DropdownMenuLabel as React.ComponentType<PanelProps>,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub as React.ComponentType<PanelProps>,
  SubTrigger: DropdownMenuSubTrigger as React.ComponentType<ItemProps>,
  SubContent: DropdownMenuSubContent as React.ComponentType<PanelProps>,
};

const CONTEXT_KIT: MenuKit = {
  Item: ContextMenuItem as React.ComponentType<ItemProps>,
  Label: ContextMenuLabel as React.ComponentType<PanelProps>,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub as React.ComponentType<PanelProps>,
  SubTrigger: ContextMenuSubTrigger as React.ComponentType<ItemProps>,
  SubContent: ContextMenuSubContent as React.ComponentType<PanelProps>,
};

function ProjectMenuItems({
  project,
  kit,
}: {
  project: ProjectWithOwner;
  kit: MenuKit;
}) {
  const a = useProjectActionsRequired();
  const { Item, Label, Separator, Sub, SubTrigger, SubContent } = kit;
  const editable = a.canEdit(project);
  const href = `/${a.ws}/projects/${project.id}`;
  const hasChildren = a.rows.some((x) => x.parent_project_id === project.id);
  const parents = a.parentsFor(project);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error(`Could not copy the ${what.toLowerCase()}.`);
    }
  };

  return (
    <>
      <Label>{project.code}</Label>
      <Item asChild>
        <Link href={href}>
          <ExternalLink strokeWidth={1.5} />
          Open
        </Link>
      </Item>
      <Item asChild>
        <a href={href} target="_blank" rel="noreferrer">
          <ExternalLink strokeWidth={1.5} />
          Open in new tab
        </a>
      </Item>
      <Item
        onSelect={() => void copy(`${window.location.origin}${href}`, "Link")}
      >
        <Link2 strokeWidth={1.5} />
        Copy link
      </Item>
      <Item onSelect={() => void copy(project.code, "Project code")}>
        <Hash strokeWidth={1.5} />
        Copy project code
      </Item>

      {editable ? (
        <>
          <Separator />
          <Sub>
            <SubTrigger>
              <SquareStack strokeWidth={1.5} />
              Change status
            </SubTrigger>
            <SubContent>
              {PROJECT_STATUS_OPTIONS.map((s) => (
                <Item key={s.value} onSelect={() => a.setStatus(project, s.value)}>
                  <Check
                    strokeWidth={2}
                    className={cn(project.status !== s.value && "opacity-0")}
                  />
                  {s.label}
                </Item>
              ))}
            </SubContent>
          </Sub>
          <Sub>
            <SubTrigger>
              <Flag strokeWidth={1.5} />
              Set priority
            </SubTrigger>
            <SubContent>
              {PRIORITY_OPTIONS.map((o) => (
                <Item key={o.value} onSelect={() => a.setPriority(project, o.value)}>
                  <Check
                    strokeWidth={2}
                    className={cn((project.priority ?? 0) !== o.value && "opacity-0")}
                  />
                  {o.label}
                </Item>
              ))}
            </SubContent>
          </Sub>
          <Sub>
            <SubTrigger>
              <UserRound strokeWidth={1.5} />
              Assign to
            </SubTrigger>
            <SubContent className="max-h-64 overflow-y-auto">
              {a.members.map((m) => (
                <Item key={m.id} onSelect={() => a.setOwner(project, m.id)}>
                  <Check
                    strokeWidth={2}
                    className={cn(project.owner_id !== m.id && "opacity-0")}
                  />
                  {m.full_name}
                </Item>
              ))}
              <Separator />
              <Item onSelect={() => a.setOwner(project, null)}>Unassigned</Item>
            </SubContent>
          </Sub>
          <Item onSelect={() => a.askDueDate(project)}>
            <CalendarDays strokeWidth={1.5} />
            Set due date
          </Item>
          {a.lists.length > 0 ? (
            <Sub>
              <SubTrigger>
                <ArrowRightLeft strokeWidth={1.5} />
                Move to list
              </SubTrigger>
              <SubContent className="max-h-64 overflow-y-auto">
                {a.lists.map((l) => (
                  <Item key={l.id} onSelect={() => a.setList(project, l.id)}>
                    <Check
                      strokeWidth={2}
                      className={cn(project.list_id !== l.id && "opacity-0")}
                    />
                    {l.name}
                  </Item>
                ))}
                <Separator />
                <Item onSelect={() => a.setList(project, null)}>No list</Item>
              </SubContent>
            </Sub>
          ) : null}
          {a.spaces.length > 1 ? (
            <Sub>
              <SubTrigger>
                <ArrowRightLeft strokeWidth={1.5} />
                Move to space
              </SubTrigger>
              <SubContent className="max-h-64 overflow-y-auto">
                {a.spaces.map((s) => (
                  <Item
                    key={s.id}
                    disabled={s.id === project.department_id}
                    onSelect={() => a.setSpace(project, s.id)}
                  >
                    <Check
                      strokeWidth={2}
                      className={cn(project.department_id !== s.id && "opacity-0")}
                    />
                    {s.name}
                  </Item>
                ))}
              </SubContent>
            </Sub>
          ) : null}
          <Sub>
            {/* A project that already has sub-projects cannot become one.
                The trigger is disabled rather than hidden, because the
                reason is the shape of this project, not the reader's role. */}
            <SubTrigger disabled={hasChildren}>
              <CornerDownRight strokeWidth={1.5} />
              Make sub-project of
            </SubTrigger>
            <SubContent className="max-h-64 overflow-y-auto">
              {parents.length === 0 ? (
                <Item disabled>Nothing available</Item>
              ) : (
                parents.map((t) => (
                  <Item key={t.id} onSelect={() => a.setParent(project, t.id)}>
                    {t.title}
                  </Item>
                ))
              )}
            </SubContent>
          </Sub>
          {project.parent_project_id ? (
            <Item onSelect={() => a.setParent(project, null)}>
              <CornerDownRight strokeWidth={1.5} className="rotate-180" />
              Promote to top level
            </Item>
          ) : null}
        </>
      ) : null}

      {a.canManage ? (
        <>
          <Separator />
          <Item onSelect={() => a.duplicate(project)}>
            <Copy strokeWidth={1.5} />
            Duplicate
          </Item>
          <Item onSelect={() => a.archive(project)}>
            <Archive strokeWidth={1.5} />
            Archive
          </Item>
        </>
      ) : null}

      <Separator />
      {/* Delete is the one action shown to people who cannot use it. Hiding
          it would leave them wondering whether the app can delete at all;
          the tooltip answers who to ask. */}
      {a.canDelete ? (
        <Item variant="destructive" onSelect={() => a.askDelete([project.id])}>
          <Trash2 strokeWidth={1.5} />
          Delete
        </Item>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block" aria-label={DELETE_DENIED}>
                <Item disabled variant="destructive">
                  <Trash2 strokeWidth={1.5} />
                  Delete
                </Item>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{DELETE_DENIED}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
}

// Right-click anywhere on the row. Renders its child untouched when there is
// no provider, so surfaces that have not adopted the menu are unaffected.
export function ProjectContextMenu({
  project,
  children,
}: {
  project: ProjectWithOwner;
  children: React.ReactNode;
}) {
  const a = useProjectActions();
  if (!a) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ProjectMenuItems project={project} kit={CONTEXT_KIT} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

// The same menu behind a button, because right-click is not discoverable and
// is not available to everyone.
export function ProjectOverflowButton({
  project,
  className,
}: {
  project: ProjectWithOwner;
  className?: string;
}) {
  const a = useProjectActions();
  if (!a) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${project.code}`}
          // How the "e" shortcut reaches this menu: it presses the same
          // button, so there is one way the menu opens rather than two.
          data-row-menu={project.id}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          className={cn(
            "rounded-[8px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100",
            className
          )}
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <ProjectMenuItems project={project} kit={DROPDOWN_KIT} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

// A plain button rather than the Checkbox primitive, because selection needs
// the modifier keys off the click event and Radix hands over only the next
// checked value.
export function SelectBox({
  project,
  className,
  persistent = false,
}: {
  project: ProjectWithOwner;
  className?: string;
  // Table keeps its column visible at all times. Everywhere else the box
  // appears on hover, or whenever it is checked, or on keyboard focus.
  persistent?: boolean;
}) {
  const a = useProjectActions();
  if (!a) return null;
  const checked = a.selected.has(project.id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Select ${project.code}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        a.selectRow(project.id, {
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
        });
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-brand bg-brand text-white"
          : "border-border-strong hover:border-text-3",
        !persistent && !checked && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        className
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

function BulkBar({
  count,
  rows,
  scope,
  onStatus,
  onOwner,
  onList,
  onArchive,
  onDelete,
  onClear,
}: {
  count: number;
  rows: ProjectWithOwner[];
  scope: ProjectActionsScope;
  onStatus: (s: ProjectStatus) => void;
  onOwner: (ownerId: string | null) => void;
  onList: (listId: string | null) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  const editable = rows.filter(
    (p) => scope.canManage || p.owner_id === scope.viewerId
  ).length;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-[12px] border border-border bg-surface px-2 py-1.5 shadow-[var(--shadow-pop)]">
        <span className="px-2 text-[12.5px] font-medium text-text-1">
          {count} selected
        </span>
        {editable < count ? (
          <span className="text-[11.5px] text-text-3">
            {count - editable} not yours
          </span>
        ) : null}
        <span className="mx-1 h-5 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Change status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            {PROJECT_STATUS_OPTIONS.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => onStatus(s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-64 w-52 overflow-y-auto">
            {scope.members.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onOwner(m.id)}>
                {m.full_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOwner(null)}>Unassigned</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {scope.lists.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Move to list
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-64 w-52 overflow-y-auto">
              {scope.lists.map((l) => (
                <DropdownMenuItem key={l.id} onSelect={() => onList(l.id)}>
                  {l.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onList(null)}>No list</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {scope.canManage ? (
          <Button variant="ghost" size="sm" onClick={onArchive}>
            <Archive strokeWidth={1.5} />
            Archive
          </Button>
        ) : null}

        {scope.canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-danger hover:text-danger"
          >
            <Trash2 strokeWidth={1.5} />
            Delete
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block" aria-label={DELETE_DENIED}>
                  <Button variant="ghost" size="sm" disabled className="text-danger">
                    <Trash2 strokeWidth={1.5} />
                    Delete
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{DELETE_DENIED}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
          <X strokeWidth={1.5} />
          Clear
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function DueDateDialog({
  project,
  onClose,
  onSave,
}: {
  project: ProjectWithOwner | null;
  onClose: () => void;
  onSave: (value: string | null) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(project?.due_date ?? "");
  }, [project]);

  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set due date</DialogTitle>
          <DialogDescription>
            {project ? `${project.code}, ${project.title}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <input
          type="date"
          value={value}
          aria-label="Due date"
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-full rounded-[9px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onSave(null)}>
            Clear date
          </Button>
          <Button onClick={() => onSave(value || null)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  ids,
  rows,
  onClose,
  onConfirm,
}: {
  ids: string[] | null;
  rows: ProjectWithOwner[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const targets = (ids ?? [])
    .map((id) => rows.find((p) => p.id === id))
    .filter((p): p is ProjectWithOwner => Boolean(p));
  const childCount = rows.filter(
    (p) => p.parent_project_id && (ids ?? []).includes(p.parent_project_id)
  ).length;

  return (
    <Dialog open={Boolean(ids)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {targets.length === 1
              ? `Delete ${targets[0].code}?`
              : `Delete ${targets.length} projects?`}
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Tasks, phases, deliverables, comments, and the
            intake record go with it.
            {childCount > 0
              ? ` ${childCount} sub-project${childCount === 1 ? "" : "s"} will be kept and promoted to top level.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {targets.length > 1 ? (
          <ul className="max-h-40 overflow-y-auto text-[12.5px] text-text-2">
            {targets.map((p) => (
              <li key={p.id} className="truncate py-0.5">
                <span className="font-mono tabular text-text-3">{p.code}</span>{" "}
                {p.title}
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-exported so views can keep their prop lists short.
export type { CompletionMap, ProjectWithOwner };
