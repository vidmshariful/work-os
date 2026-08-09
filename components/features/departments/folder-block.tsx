"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder, MoreHorizontal, Palette, Pencil, Trash2 } from "lucide-react";
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
import { TAG_TONES, isTagTone, toneDotClass } from "@/components/primitives/tag";
import {
  deleteFolder,
  renameFolder,
  setFolderColor,
} from "@/lib/actions/departments";
import { cn } from "@/lib/utils";

export interface FolderRow {
  id: string;
  name: string;
  color: string | null;
}

// A folder wraps the list sections that belong to it. Folders are optional,
// so a space with none renders exactly as it did before they existed: the
// block with folder null draws nothing around its children.
export function FolderBlock({
  ws,
  slug,
  folder,
  listCount,
  canEdit,
  startCollapsed = false,
  children,
}: {
  ws?: string;
  slug?: string;
  folder: FolderRow | null;
  listCount?: number;
  canEdit?: boolean;
  // A folder holding no work at all starts shut. Production reads in
  // pipeline order, so pre-production sits above the animation that pays for
  // the studio, and three empty lists at the top would push the real work
  // off the first screen every morning. One click opens it, and it stays
  // open once anything is filed there.
  startCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!startCollapsed);
  const [renaming, setRenaming] = useState(false);
  // Set when Rename is chosen, read when the menu closes.
  const renameWanted = useRef(false);
  const [draft, setDraft] = useState(folder?.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(folder?.name ?? "");
    requestAnimationFrame(() => input.current?.select());
  }, [renaming, folder?.name]);

  if (!folder) return <div className="flex flex-col gap-5">{children}</div>;

  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });

  const commit = () => {
    const clean = draft.trim();
    setRenaming(false);
    if (!clean || clean === folder.name || !ws || !slug) return;
    run(() => renameFolder(ws, slug, folder.id, clean));
  };

  const dot =
    folder.color && isTagTone(folder.color) ? (
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", toneDotClass(folder.color))}
      />
    ) : (
      <Folder className="size-3.5 shrink-0 text-text-3" strokeWidth={1.5} />
    );

  return (
    <section className="rounded-[14px] border border-border bg-surface-2/30 p-2.5">
      <div className="group/folder mb-1.5 flex items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          className="flex items-center gap-1.5 rounded-[6px] text-text-2 outline-none transition-colors hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
            strokeWidth={2}
          />
          {renaming ? null : (
            <span className="flex items-center gap-1.5">
              {dot}
              <span className="text-[13px] font-semibold text-text-1">{folder.name}</span>
            </span>
          )}
        </button>

        {renaming ? (
          <span className="flex items-center gap-1.5">
            {dot}
            <input
              ref={input}
              autoFocus
              value={draft}
              aria-label={`Rename ${folder.name}`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  // This input owns Escape while it is open. Letting it
                  // through would clear the row selection behind the folder.
                  e.stopPropagation();
                  setRenaming(false);
                }
              }}
              className="h-6 w-48 rounded-[7px] border border-brand bg-surface px-1.5 text-[13px] font-semibold text-text-1 outline-none ring-2 ring-brand/25"
            />
          </span>
        ) : null}

        <span className="font-mono text-[11px] text-text-3 tabular">
          {listCount ?? 0}
        </span>

        {canEdit && ws && slug ? (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Folder actions for ${folder.name}`}
                  disabled={pending}
                  className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover/folder:opacity-100 aria-expanded:opacity-100"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                // Same as the list menu: the rename input focuses itself, and
                // the menu restoring focus to this trigger would take it away
                // again.
                onCloseAutoFocus={(e) => {
                  if (!renameWanted.current) return;
                  renameWanted.current = false;
                  e.preventDefault();
                }}
              >
                <DropdownMenuItem
                  onSelect={() => {
                    renameWanted.current = true;
                    setRenaming(true);
                  }}
                >
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
                      <DropdownMenuItem
                        key={tone}
                        onSelect={() => run(() => setFolderColor(ws, slug, folder.id, tone))}
                      >
                        <span className={cn("size-2.5 rounded-full", toneDotClass(tone))} />
                        <span className="capitalize">{tone}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => run(() => setFolderColor(ws, slug, folder.id, null))}
                    >
                      <span className="size-2.5 rounded-full border border-border-strong" />
                      No colour
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                  <Trash2 strokeWidth={1.5} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {open ? <div className="flex flex-col gap-4">{children}</div> : null}

      {/* Deleting a folder keeps its lists, which is the opposite of what
          most people expect from a folder, so it is said out loud. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {folder.name}?</DialogTitle>
            <DialogDescription>
              {listCount
                ? `The lists are not deleted. ${listCount} list${
                    listCount === 1 ? "" : "s"
                  } will move out to the top of this space, keeping every project inside ${
                    listCount === 1 ? "it" : "them"
                  }.`
                : "This folder is empty, so nothing moves."}
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
                if (!ws || !slug) return;
                start(async () => {
                  const res = await deleteFolder(ws, slug, folder.id);
                  if (res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(
                    res.unfiled === 0
                      ? "Folder deleted."
                      : `Folder deleted. ${res.unfiled} list${
                          res.unfiled === 1 ? "" : "s"
                        } moved to the top of the space.`
                  );
                  router.refresh();
                });
              }}
            >
              {listCount
                ? `Delete folder, keep ${listCount} list${listCount === 1 ? "" : "s"}`
                : "Delete folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
