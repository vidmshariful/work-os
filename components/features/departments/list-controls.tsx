"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Copy,
  MoreHorizontal,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Button } from "@/components/ui/button";
import { TAG_TONES, toneDotClass } from "@/components/primitives/tag";
import {
  deleteList,
  duplicateList,
  moveListToSpace,
  renameList,
  setListColor,
} from "@/lib/actions/departments";
import { cn } from "@/lib/utils";

export interface ListPatch {
  name?: string;
  color?: string | null;
}

// Every list edit on this page goes through here: one optimistic layer, one
// rollback, one place that knows a failed edit has to put the old value back.
export function useListEdits({ ws, slug }: { ws: string; slug: string }) {
  const router = useRouter();
  const [patches, setPatches] = useState<Record<string, ListPatch>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const run = useCallback(
    (
      id: string,
      patch: ListPatch | null,
      hide: boolean,
      call: () => Promise<{ error: string | null }>,
      done?: () => void
    ) => {
      const before = patches[id];
      if (patch) setPatches((m) => ({ ...m, [id]: { ...(m[id] ?? {}), ...patch } }));
      if (hide) setGone((s) => new Set(s).add(id));
      void call().then((res) => {
        if (res.error) {
          // Back to exactly what was there before this edit, not to the
          // server's value: an earlier edit in the same session may still be
          // in flight and is none of this one's business.
          if (patch) {
            setPatches((m) => {
              const next = { ...m };
              if (before) next[id] = before;
              else delete next[id];
              return next;
            });
          }
          if (hide) {
            setGone((s) => {
              const next = new Set(s);
              next.delete(id);
              return next;
            });
          }
          toast.error(res.error);
          return;
        }
        done?.();
      });
    },
    [patches]
  );

  const rename = useCallback(
    (id: string, name: string) => {
      setRenamingId(null);
      run(id, { name }, false, () => renameList(ws, slug, id, name));
    },
    [run, slug, ws]
  );

  const setColor = useCallback(
    (id: string, color: string | null) => {
      run(id, { color }, false, () => setListColor(ws, slug, id, color));
    },
    [run, slug, ws]
  );

  const move = useCallback(
    (id: string, departmentId: string, spaceName: string) => {
      // It leaves this space, so it leaves this page along with its projects.
      run(id, null, true, () => moveListToSpace(ws, slug, id, departmentId), () => {
        toast.success(`List moved to ${spaceName}.`);
        router.refresh();
      });
    },
    [router, run, slug, ws]
  );

  const duplicate = useCallback(
    (id: string, withProjects: boolean) => {
      // No optimistic section: the copy's id comes from the database.
      void duplicateList(ws, slug, id, withProjects).then((res) => {
        if (res.error) toast.error(res.error);
        else {
          toast.success(withProjects ? "List and projects copied." : "List copied.");
          router.refresh();
        }
      });
    },
    [router, slug, ws]
  );

  const remove = useCallback(
    (id: string) => {
      setGone((s) => new Set(s).add(id));
      void deleteList(ws, id, slug).then((res) => {
        if (res.error) {
          setGone((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
          toast.error(res.error);
          return;
        }
        toast.success(
          res.moved === 0
            ? "List deleted."
            : `List deleted. ${res.moved} project${res.moved === 1 ? "" : "s"} moved to Unlisted.`
        );
        router.refresh();
      });
    },
    [router, slug, ws]
  );

  return {
    patches,
    gone,
    renamingId,
    startRename: setRenamingId,
    cancelRename: () => setRenamingId(null),
    rename,
    setColor,
    move,
    duplicate,
    remove,
  };
}

export function ListSectionMenu({
  list,
  projectCount,
  spaces,
  currentSpaceId,
  canManage,
  onStartRename,
  onSetColor,
  onMove,
  onDuplicate,
  onDelete,
}: {
  list: { id: string; name: string; color: string | null };
  // Counted across the whole space, not the filtered view, because the
  // confirmation has to state what will really happen.
  projectCount: number;
  spaces: { id: string; name: string }[];
  currentSpaceId: string;
  // canCreateProjects. Anything that writes to projects needs it.
  canManage: boolean;
  onStartRename: () => void;
  onSetColor: (color: string | null) => void;
  onMove: (departmentId: string, spaceName: string) => void;
  onDuplicate: (withProjects: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const elsewhere = spaces.filter((s) => s.id !== currentSpaceId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`List actions for ${list.name}`}
            className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover/section:opacity-100 aria-expanded:opacity-100"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil strokeWidth={1.5} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette strokeWidth={1.5} />
              Set colour
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {TAG_TONES.map((tone) => (
                <DropdownMenuItem key={tone} onSelect={() => onSetColor(tone)}>
                  <span className={cn("size-2.5 rounded-full", toneDotClass(tone))} />
                  <span className="capitalize">{tone}</span>
                  {list.color === tone ? (
                    <span className="ml-auto text-[11px] text-text-3">Current</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onSetColor(null)}>
                <span className="size-2.5 rounded-full border border-border-strong" />
                No colour
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {/* Moving a list rewrites its projects' space, which projects_update
              reserves for managers. Hidden rather than disabled for a lead. */}
          {canManage && elsewhere.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft strokeWidth={1.5} />
                Move to another space
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 w-48 overflow-y-auto">
                {elsewhere.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => onMove(s.id, s.name)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-[11.5px]">
                  {projectCount === 0
                    ? "Nothing filed here yet"
                    : `${projectCount} project${projectCount === 1 ? "" : "s"} move too`}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Copy strokeWidth={1.5} />
              Duplicate
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuItem onSelect={() => onDuplicate(false)}>
                Empty copy
              </DropdownMenuItem>
              {canManage ? (
                <DropdownMenuItem
                  disabled={projectCount === 0}
                  onSelect={() => onDuplicate(true)}
                >
                  {projectCount === 0
                    ? "With projects, none to copy"
                    : `With its ${projectCount} project${projectCount === 1 ? "" : "s"}`}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 strokeWidth={1.5} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Nobody deletes a list without being told where its work goes. The
          count is the whole point of the dialog, so it is in the sentence and
          in the button. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {list.name}?</DialogTitle>
            <DialogDescription>
              {projectCount === 0
                ? "Nothing is filed in this list, so nothing moves."
                : `The projects are not deleted. ${projectCount} project${
                    projectCount === 1 ? "" : "s"
                  } will move to Unlisted, where you can refile ${
                    projectCount === 1 ? "it" : "them"
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              {projectCount === 0
                ? "Delete list"
                : `Delete list, move ${projectCount} to Unlisted`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
