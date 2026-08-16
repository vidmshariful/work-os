"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CircleCheckBig,
  Download,
  ExternalLink,
  FileText,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Tag } from "@/components/primitives/tag";
import { fmtDate, fmtMoney } from "@/lib/format";
import { TimeAgo } from "@/components/primitives/local-time";
import { cn } from "@/lib/utils";
import {
  addContact,
  addClientNote,
  addClientTodo,
  addPayment,
  deleteClientDocument,
  deleteClientNote,
  deleteClientTodo,
  deleteContact,
  deletePayment,
  getClientDocumentUrl,
  markPaymentPaid,
  setPrimaryContact,
  toggleClientTodo,
  uploadClientDocument,
  type WorkroomState,
} from "@/lib/actions/client-work";
import type {
  ClientContact,
  ClientDocument,
  ClientNote,
  ClientPayment,
  ClientTodo,
} from "@/lib/types";
import type { ThreadPerson } from "./activity-thread";

const initialState: WorkroomState = { error: null };

const inputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand";

function useResetOnSuccess(state: WorkroomState, close?: () => void) {
  const formRef = useRef<HTMLFormElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (state.error) toast.error(state.error);
    else {
      formRef.current?.reset();
      close?.();
    }
  }, [state, close]);
  return formRef;
}

// ---- payments ----

export interface PaymentProjectOption {
  id: string;
  code: string;
}

export function PaymentsCard({
  ws,
  clientId,
  payments,
  projects = [],
}: {
  ws: string;
  clientId: string;
  payments: ClientPayment[];
  projects?: PaymentProjectOption[];
}) {
  const projectCodeById = new Map(projects.map((p) => [p.id, p.code]));
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(addPayment, initialState);
  const formRef = useResetOnSuccess(state, () => setAdding(false));
  const [, startTransition] = useTransition();

  const paid = payments.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = payments.filter((p) => !p.paid_at).reduce((s, p) => s + Number(p.amount), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2.5">
      {payments.length > 0 ? (
        <div className="flex items-center gap-4 rounded-[10px] bg-surface-2 px-3 py-2 text-meta">
          <span className="text-text-2">
            Paid{" "}
            <span className="font-mono font-medium text-success tabular">{fmtMoney(paid)}</span>
          </span>
          <span className="text-text-2">
            Due{" "}
            <span className={cn("font-mono font-medium tabular", outstanding > 0 ? "text-wall" : "text-text-1")}>
              {fmtMoney(outstanding)}
            </span>
          </span>
        </div>
      ) : null}
      {payments.map((p) => {
        const overdue = !p.paid_at && p.due_date && p.due_date < today;
        return (
          <div key={p.id} className="group flex items-center gap-2.5 px-0.5">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                p.paid_at ? "bg-success" : overdue ? "bg-danger" : "bg-tag-amber"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-body font-medium text-text-1">
                {p.label}
                {p.project_id && projectCodeById.get(p.project_id) ? (
                  <span className="font-mono text-micro font-medium text-text-3 tabular">
                    {projectCodeById.get(p.project_id)}
                  </span>
                ) : null}
              </p>
              <p className="text-label text-text-3">
                {p.paid_at
                  ? <>Paid <TimeAgo at={p.paid_at} /></>
                  : p.due_date
                    ? `${overdue ? "Overdue, was due" : "Due"} ${fmtDate(p.due_date)}`
                    : "No due date"}
                {p.invoice_url ? (
                  <>
                    {" · "}
                    <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                      invoice
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <span className="font-mono text-meta font-medium text-text-1 tabular">
              {fmtMoney(Number(p.amount))}
            </span>
            {!p.paid_at ? (
              <button
                title="Mark paid"
                onClick={() =>
                  startTransition(async () => {
                    const res = await markPaymentPaid(ws, clientId, p.id);
                    if (res.error) toast.error(res.error);
                    else toast.success("Payment marked paid.");
                  })
                }
                className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-success-soft hover:text-success group-hover:opacity-100"
              >
                <CircleCheckBig className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
            <button
              title="Remove payment"
              onClick={() => startTransition(() => deletePayment(ws, clientId, p.id))}
              className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
      {adding ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-2.5">
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="client_id" value={clientId} />
          <input name="label" required placeholder="Balance 50%" className={inputClass} />
          <div className="flex gap-2">
            <input name="amount" required type="number" min="0" step="50" placeholder="6000" className={`${inputClass} font-mono tabular`} />
            <input name="due_date" type="date" className={inputClass} />
          </div>
          <input name="invoice_url" placeholder="Invoice link, optional" className={inputClass} />
          {projects.length > 0 ? (
            <select name="project_id" className={inputClass} defaultValue="" aria-label="For project">
              <option value="">Not tied to a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Add
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add payment
        </Button>
      )}
    </div>
  );
}

// ---- documents ----

export function DocumentsCard({
  ws,
  clientId,
  documents,
}: {
  ws: string;
  clientId: string;
  documents: ClientDocument[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(uploadClientDocument, initialState);
  const formRef = useResetOnSuccess(state, () => setAdding(false));
  const [, startTransition] = useTransition();

  const open = (doc: ClientDocument) => {
    if (doc.external_url) {
      window.open(doc.external_url, "_blank", "noopener");
      return;
    }
    if (!doc.storage_path) return;
    startTransition(async () => {
      const res = await getClientDocumentUrl(ws, clientId, doc.storage_path!);
      if (res.error || !res.url) toast.error(res.error ?? "Could not open.");
      else window.open(res.url, "_blank", "noopener");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {documents.map((doc) => (
        <div key={doc.id} className="group flex items-center gap-2.5 px-0.5">
          <FileText className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-text-1">{doc.title}</p>
            <p className="flex items-center gap-1.5 text-label text-text-3">
              <span className="capitalize">{doc.doc_type}</span>
              {doc.doc_type === "contract" && doc.contract_status !== "none" ? (
                <Tag tone={doc.contract_status === "signed" ? "green" : "amber"}>
                  {doc.contract_status}
                </Tag>
              ) : null}
            </p>
          </div>
          <button
            title={doc.external_url ? "Open link" : "Download"}
            onClick={() => open(doc)}
            className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-brand-soft hover:text-brand group-hover:opacity-100"
          >
            {doc.external_url ? (
              <ExternalLink className="size-3.5" strokeWidth={1.5} />
            ) : (
              <Download className="size-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            title="Delete"
            onClick={() => startTransition(() => deleteClientDocument(ws, clientId, doc.id))}
            className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
      {adding ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-2.5">
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="client_id" value={clientId} />
          <input name="title" required placeholder="Service agreement" className={inputClass} />
          <div className="flex gap-2">
            <select name="doc_type" className={inputClass} defaultValue="contract">
              <option value="contract">Contract</option>
              <option value="proposal">Proposal</option>
              <option value="other">Other</option>
            </select>
            <select name="contract_status" className={inputClass} defaultValue="draft">
              <option value="none">No status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
            </select>
          </div>
          <input name="external_url" placeholder="Link, or attach a file below" className={inputClass} />
          <input name="file" type="file" className="text-meta text-text-2 file:mr-2 file:rounded-[7px] file:border-0 file:bg-chip-gray file:px-2.5 file:py-1 file:text-meta file:font-medium file:text-text-1" />
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving" : "Add"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add document
        </Button>
      )}
    </div>
  );
}

// ---- to-dos ----

export function TodosCard({
  ws,
  clientId,
  todos,
  people,
}: {
  ws: string;
  clientId: string;
  todos: ClientTodo[];
  people: ThreadPerson[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(addClientTodo, initialState);
  const formRef = useResetOnSuccess(state, () => setAdding(false));
  const [, startTransition] = useTransition();
  const personById = new Map(people.map((p) => [p.id, p]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      {todos.map((t) => {
        const assignee = t.assignee_id ? personById.get(t.assignee_id) : null;
        const overdue = !t.is_done && t.due_date && t.due_date < today;
        return (
          <div key={t.id} className="group flex items-center gap-2.5 px-0.5">
            <Checkbox
              checked={t.is_done}
              aria-label={t.title}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  const res = await toggleClientTodo(ws, clientId, t.id, checked === true);
                  if (res.error) toast.error(res.error);
                })
              }
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-body",
                  t.is_done ? "text-text-3 line-through" : "font-medium text-text-1"
                )}
              >
                {t.title}
              </p>
              {t.due_date && !t.is_done ? (
                <p className={cn("font-mono text-label tabular", overdue ? "font-medium text-danger" : "text-text-3")}>
                  {fmtDate(t.due_date)}
                </p>
              ) : null}
            </div>
            {assignee ? (
              <PersonAvatar name={assignee.full_name} src={assignee.avatar_url} size={22} />
            ) : null}
            <button
              title="Delete to-do"
              onClick={() => startTransition(() => deleteClientTodo(ws, clientId, t.id))}
              className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
      {adding ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-2.5">
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="client_id" value={clientId} />
          <input name="title" required placeholder="Send the balance invoice" className={inputClass} />
          <div className="flex gap-2">
            <select name="assignee_id" className={inputClass} defaultValue="">
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input name="due_date" type="date" className={inputClass} />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Add
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add to-do
        </Button>
      )}
    </div>
  );
}

// ---- notes ----

export function NotesCard({
  ws,
  clientId,
  notes,
  people,
  userId,
}: {
  ws: string;
  clientId: string;
  notes: ClientNote[];
  people: ThreadPerson[];
  userId: string;
}) {
  const [state, formAction, pending] = useActionState(addClientNote, initialState);
  const formRef = useResetOnSuccess(state);
  const [, startTransition] = useTransition();
  const personById = new Map(people.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-2.5">
      {notes.map((n) => {
        const author = personById.get(n.author_id);
        return (
          <div key={n.id} className="group rounded-[10px] bg-wall-soft/50 px-3 py-2">
            <p className="whitespace-pre-wrap text-body leading-relaxed text-text-1">
              {n.body}
            </p>
            <p className="mt-1 flex items-center justify-between text-label text-text-3">
              <span>
                {author?.full_name ?? "Someone"}, <TimeAgo at={n.created_at} />
              </span>
              {n.author_id === userId ? (
                <button
                  title="Delete note"
                  onClick={() => startTransition(() => deleteClientNote(ws, clientId, n.id))}
                  className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="size-3" strokeWidth={1.5} />
                </button>
              ) : null}
            </p>
          </div>
        );
      })}
      <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
        <input type="hidden" name="ws" value={ws} />
        <input type="hidden" name="client_id" value={clientId} />
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Pin a fact the team should not forget."
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Add note
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---- contacts ----

export function ContactsCard({
  ws,
  clientId,
  contacts,
}: {
  ws: string;
  clientId: string;
  contacts: ClientContact[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(addContact, initialState);
  const formRef = useResetOnSuccess(state, () => setAdding(false));
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2.5">
      {contacts.map((c) => (
        <div key={c.id} className="group flex items-start gap-2.5 px-0.5">
          <PersonAvatar name={c.name} size={26} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-body font-medium text-text-1">
              <span className="truncate">{c.name}</span>
              {c.is_primary ? (
                <Star className="size-3 shrink-0 fill-tag-amber text-tag-amber" />
              ) : null}
            </p>
            {c.role_label ? <p className="text-label text-text-3">{c.role_label}</p> : null}
            {c.email ? (
              <a href={`mailto:${c.email}`} className="block truncate text-meta text-brand hover:underline">
                {c.email}
              </a>
            ) : null}
            {c.phone ? <p className="font-mono text-meta text-text-2 tabular">{c.phone}</p> : null}
          </div>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            {!c.is_primary ? (
              <button
                title="Make primary"
                onClick={() => startTransition(() => setPrimaryContact(ws, clientId, c.id))}
                className="rounded-[7px] p-1 text-text-3 hover:bg-surface-2 hover:text-text-1"
              >
                <Star className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
            <button
              title="Remove contact"
              onClick={() => startTransition(() => deleteContact(ws, clientId, c.id))}
              className="rounded-[7px] p-1 text-text-3 hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ))}
      {adding ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-2.5">
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="client_id" value={clientId} />
          <input name="name" required placeholder="Full name" className={inputClass} />
          <input name="role_label" placeholder="Role, like Decision maker" className={inputClass} />
          <div className="flex gap-2">
            <input name="email" type="email" placeholder="Email" className={inputClass} />
            <input name="phone" placeholder="Phone" className={inputClass} />
          </div>
          <label className="flex items-center gap-2 text-meta text-text-2">
            <input type="checkbox" name="is_primary" className="size-3.5 accent-[var(--brand)]" />
            Primary contact
          </label>
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Add
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add contact
        </Button>
      )}
    </div>
  );
}
