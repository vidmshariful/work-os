"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FolderPlus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import { PersonAvatar } from "@/components/primitives/avatar";
import {
  createFolder,
  deleteFolder,
  moveDocToFolder,
  moveTableToFolder,
  setFolderShare,
  updateFolder,
} from "@/lib/actions/db-folders";
import type { DbScope } from "@/lib/types";
import type { ShareRow } from "./table-controls";

const PALETTE = ["#3B6FF6", "#7C5CFC", "#16A34A", "#E5486D", "#12A8A0", "#8A94A3"];

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function NewFolderDialog({ ws }: { ws: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await createFolder(ws, name, description, color);
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not create the folder.");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/${ws}/database/folders/${res.id}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus />
          New folder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Name" htmlFor="fld_name">
            <input
              id="fld_name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Studio logins"
              className={inputClass}
            />
          </Field>
          <Field
            label="Description"
            htmlFor="fld_desc"
            hint="Optional. What belongs in here."
          >
            <input
              id="fld_desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className="size-6 rounded-full"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating" : "Create folder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Who holds this folder. A grant here reaches every table and document
// filed in it, which is the whole point of a folder: hand it over once
// instead of item by item.
export function FolderPeopleDialog({
  ws,
  folderId,
  scope,
  shares,
  members,
  canEdit,
  itemCount,
}: {
  ws: string;
  folderId: string;
  scope: DbScope;
  shares: ShareRow[];
  members: { id: string; full_name: string }[];
  canEdit: boolean;
  itemCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  const held = new Set(shares.map((s) => s.profile_id));
  const available = members.filter((m) => !held.has(m.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users />
          People
          {shares.length > 0 ? (
            <span className="ml-1 font-mono tabular text-[12px] text-text-3">
              {shares.length}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Who has this folder</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text-1">
              <Building2 className="size-4 text-text-3" strokeWidth={1.5} />
              {scope === "company" ? "In the company database" : "Private to you"}
            </div>
            <p className="mt-1 text-[12.5px] text-text-2">
              {scope === "company"
                ? "Everyone in the workspace can open this folder and everything in it."
                : "Only you and the people below can open this folder."}
            </p>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2.5"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    updateFolder(ws, folderId, {
                      scope: scope === "company" ? "personal" : "company",
                    })
                  )
                }
              >
                {scope === "company"
                  ? "Make it private again"
                  : "Add this to the company database"}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-text-2">People</span>
            {shares.length === 0 ? (
              <p className="text-[12.5px] text-text-3">Nobody else has this folder yet.</p>
            ) : (
              shares.map((s) => (
                <div key={s.profile_id} className="flex items-center gap-2">
                  <PersonAvatar name={s.name} src={s.avatar_url} size={24} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">{s.name}</span>
                  {canEdit ? (
                    <>
                      <select
                        value={s.can_edit ? "edit" : "view"}
                        aria-label={`Access for ${s.name}`}
                        onChange={(e) =>
                          run(() =>
                            setFolderShare(ws, folderId, s.profile_id, e.target.value === "edit")
                          )
                        }
                        className="h-7 rounded-[8px] border border-border bg-surface px-2 text-[12px] text-text-2 outline-none focus-visible:border-brand"
                      >
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </select>
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={() => run(() => setFolderShare(ws, folderId, s.profile_id, null))}
                        className="rounded-[6px] p-1 text-text-3 hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="size-3.5" strokeWidth={1.5} />
                      </button>
                    </>
                  ) : (
                    <span className="text-[12px] text-text-3">
                      {s.can_edit ? "Can edit" : "Can view"}
                    </span>
                  )}
                </div>
              ))
            )}
            {canEdit && available.length > 0 ? (
              <select
                value=""
                aria-label="Add a person"
                onChange={(e) =>
                  e.target.value && run(() => setFolderShare(ws, folderId, e.target.value, false))
                }
                className="h-8 rounded-[8px] border border-dashed border-border bg-surface px-2 text-[12.5px] text-text-2 outline-none focus-visible:border-brand"
              >
                <option value="">Add a person</option>
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <p className="border-t border-border pt-3 text-[12px] text-text-3">
            {itemCount === 0
              ? "Nothing is filed here yet. Anyone added above will see whatever you move in."
              : `Anyone added here can open all ${itemCount} item${itemCount === 1 ? "" : "s"} in this folder, including any stored passwords. Every password they reveal is recorded.`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Filing. Used from a table page and a document page, so both say the same
// thing in the same words.
export function MoveToFolder({
  ws,
  kind,
  itemId,
  folderId,
  folders,
}: {
  ws: string;
  kind: "table" | "doc";
  itemId: string;
  folderId: string | null;
  folders: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();

  return (
    <select
      value={folderId ?? ""}
      disabled={pending}
      aria-label="Folder"
      onChange={(e) => {
        const next = e.target.value || null;
        start(async () => {
          const res =
            kind === "table"
              ? await moveTableToFolder(ws, itemId, next)
              : await moveDocToFolder(ws, itemId, next);
          if (res.error) toast.error(res.error);
        });
      }}
      className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-text-2 outline-none focus-visible:border-brand"
    >
      <option value="">No folder</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

export function DeleteFolderButton({
  ws,
  folderId,
  itemCount,
}: {
  ws: string;
  folderId: string;
  itemCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-text-3 hover:text-danger"
      onClick={() => {
        // Said plainly, because the answer is not the one people fear: the
        // contents come back out to the top level rather than going with it.
        const message =
          itemCount === 0
            ? "Delete this folder?"
            : `Delete this folder? The ${itemCount} item${itemCount === 1 ? "" : "s"} inside will move back to the top level, not be deleted.`;
        if (!window.confirm(message)) return;
        start(async () => {
          const res = await deleteFolder(ws, folderId);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          router.push(`/${ws}/database`);
        });
      }}
    >
      <Trash2 />
      Delete folder
    </Button>
  );
}
