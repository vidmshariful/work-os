"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Share2, X } from "lucide-react";
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
import { createTable, setTableScope, setTableShare } from "@/lib/actions/database";
import type { DbScope } from "@/lib/types";

const PALETTE = ["#3B6FF6", "#7C5CFC", "#16A34A", "#E5486D", "#12A8A0", "#8A94A3"];

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export interface ShareRow {
  profile_id: string;
  can_edit: boolean;
  name: string;
  avatar_url: string | null;
}

export function NewTableDialog({ ws }: { ws: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await createTable(ws, name, description, color);
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not create the table.");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/${ws}/database/${res.id}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New table
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New table</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Name" htmlFor="tbl_name">
            <input
              id="tbl_name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tech stack"
              className={inputClass}
            />
          </Field>
          <Field label="Description" htmlFor="tbl_desc" hint="Optional. What this table is for.">
            <input
              id="tbl_desc"
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
              {pending ? "Creating" : "Create table"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShareTableDialog({
  ws,
  tableId,
  scope,
  contributed,
  shares,
  members,
  canEdit,
}: {
  ws: string;
  tableId: string;
  scope: DbScope;
  contributed: boolean;
  shares: ShareRow[];
  members: { id: string; full_name: string }[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  const sharedIds = new Set(shares.map((s) => s.profile_id));
  const available = members.filter((m) => !sharedIds.has(m.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this table</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text-1">
              <Building2 className="size-4 text-text-3" strokeWidth={1.5} />
              {scope === "company" ? "In the company database" : "Private to you"}
            </div>
            <p className="mt-1 text-[12.5px] text-text-2">
              {scope === "company"
                ? contributed
                  ? "Everyone in the workspace can see this. It shows as shared by the team."
                  : "Everyone in the workspace can see this."
                : "Only you and the people below can see this."}
            </p>
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2.5"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setTableScope(ws, tableId, scope === "company" ? "personal" : "company")
                  )
                }
              >
                {scope === "company"
                  ? "Make it private again"
                  : "Add this to the company database too"}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-text-2">People</span>
            {shares.length === 0 ? (
              <p className="text-[12.5px] text-text-3">Not shared with anyone yet.</p>
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
                            setTableShare(ws, tableId, s.profile_id, e.target.value === "edit")
                          )
                        }
                        className="h-7 rounded-[8px] border border-border bg-surface px-2 text-[12px] text-text-2 outline-none focus-visible:border-brand"
                      >
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </select>
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={() => run(() => setTableShare(ws, tableId, s.profile_id, null))}
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
                  e.target.value && run(() => setTableShare(ws, tableId, e.target.value, false))
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
            Rows here are free text, not client records, so nothing is masked
            automatically. Keep client names out of tables shared below the wall.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
