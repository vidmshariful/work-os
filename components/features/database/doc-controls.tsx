"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Link2, Plus, Share2, Upload, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  createDoc,
  setDocScope,
  setDocShare,
  uploadDoc,
  type DocCreateState,
} from "@/lib/actions/docs";
import type { DbScope, DocKind } from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

const initialUpload: DocCreateState = { error: null, id: null };

export interface DocShareRow {
  profile_id: string;
  can_edit: boolean;
  name: string;
  avatar_url: string | null;
}

export function NewDocDialog({ ws }: { ws: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocKind>("page");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  const [upState, uploadAction, uploading] = useActionState(uploadDoc, initialUpload);
  useEffect(() => {
    if (upState.error) toast.error(upState.error);
    else if (upState.id) {
      setOpen(false);
      router.push(`/${ws}/database/docs/${upState.id}`);
    }
  }, [upState, router, ws]);

  const submit = () =>
    start(async () => {
      const res = await createDoc(ws, title, kind, url);
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not create the doc.");
        return;
      }
      setOpen(false);
      setTitle("");
      setUrl("");
      router.push(`/${ws}/database/docs/${res.id}`);
    });

  const tab = (k: DocKind, label: string, Icon: typeof FileText) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12.5px] font-medium transition-colors",
        kind === k ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New doc
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New doc</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-[9px] border border-border bg-surface p-0.5">
          {tab("page", "Page", FileText)}
          {tab("file", "Upload", Upload)}
          {tab("link", "Link", Link2)}
        </div>

        {kind === "file" ? (
          <form action={uploadAction} className="flex flex-col gap-4">
            <input type="hidden" name="ws" value={ws} />
            <Field label="Title" htmlFor="doc_title" hint="Optional. Defaults to the file name.">
              <input id="doc_title" name="title" className={inputClass} />
            </Field>
            <Field label="File" htmlFor="doc_file" hint="Any format, up to 25 MB. HTML, PDF, and images preview in the app.">
              <input
                id="doc_file"
                name="file"
                type="file"
                required
                className="text-[13px] text-text-2 file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-text-1"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={uploading}>
                {uploading ? "Uploading" : "Upload doc"}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Title" htmlFor="doc_title2">
              <input
                id="doc_title2"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === "link" ? "Brand guidelines" : "Tech stack notes"}
                className={inputClass}
              />
            </Field>
            {kind === "link" ? (
              <Field
                label="Link"
                htmlFor="doc_url"
                hint="Google Docs, Sheets, and Slides preview inside the app when they are public."
              >
                <input
                  id="doc_url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className={inputClass}
                />
              </Field>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !title.trim()}>
                {pending ? "Creating" : "Create doc"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ShareDocDialog({
  ws,
  docId,
  scope,
  contributed,
  shares,
  members,
  canEdit,
}: {
  ws: string;
  docId: string;
  scope: DbScope;
  contributed: boolean;
  shares: DocShareRow[];
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
          <DialogTitle>Share this doc</DialogTitle>
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
                  run(() => setDocScope(ws, docId, scope === "company" ? "personal" : "company"))
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
                          run(() => setDocShare(ws, docId, s.profile_id, e.target.value === "edit"))
                        }
                        className="h-7 rounded-[8px] border border-border bg-surface px-2 text-[12px] text-text-2 outline-none focus-visible:border-brand"
                      >
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </select>
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={() => run(() => setDocShare(ws, docId, s.profile_id, null))}
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
                  e.target.value && run(() => setDocShare(ws, docId, e.target.value, false))
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
            Docs are free text and uploads, not client records, so nothing is
            masked automatically. Keep client names out of docs shared below the wall.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
