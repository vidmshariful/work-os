"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import {
  cancelLeaveRequest,
  createLeaveForTeammate,
  createLeaveRequest,
  decideLeave,
  endorseLeave,
  setLeaveAllowance,
  type LeaveActionState,
} from "@/lib/actions/leave";

const initialState: LeaveActionState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function LeaveRequestForm({ ws }: { ws: string }) {
  const [state, formAction, pending] = useActionState(
    createLeaveRequest,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />
      <Field label="Type" htmlFor="leave_type">
        <select id="leave_type" name="type" className={inputClass} defaultValue="annual">
          <option value="annual">Annual</option>
          <option value="sick">Sick</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="leave_start">
          <input id="leave_start" name="start_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Last day" htmlFor="leave_end">
          <input id="leave_end" name="end_date" type="date" required className={inputClass} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="leave_reason" hint="Weekends are not counted.">
        <textarea
          id="leave_reason"
          name="reason"
          rows={2}
          placeholder="Optional"
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
      </Field>
      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting" : "Request leave"}
        </Button>
      </div>
    </form>
  );
}

export function CancelLeaveButton({
  ws,
  requestId,
  // Cancelling somebody else's approved leave is not the same gesture as
  // withdrawing your own pending request, so it asks first and says what it
  // gives back.
  confirmWith,
}: {
  ws: string;
  requestId: string;
  confirmWith?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirmWith && !window.confirm(confirmWith)) return;
        startTransition(async () => {
          const res = await cancelLeaveRequest(ws, requestId);
          if (res.error) toast.error(res.error);
          else toast.success(res.success ?? "Cancelled.");
        });
      }}
    >
      {confirmWith ? "Remove" : "Cancel"}
    </Button>
  );
}

// Recording leave for a teammate. Admin only, and the page only renders it
// for one, but the action checks the archetype again on the server.
export function RecordLeaveForm({
  ws,
  people,
}: {
  ws: string;
  people: { id: string; full_name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createLeaveForTeammate,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who" htmlFor="rec_person">
          <select id="rec_person" name="profile_id" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pick a teammate
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type" htmlFor="rec_type">
          <select id="rec_type" name="type" className={inputClass} defaultValue="annual">
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="unpaid">Unpaid</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="rec_start">
          <input id="rec_start" name="start_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Last day" htmlFor="rec_end">
          <input id="rec_end" name="end_date" type="date" required className={inputClass} />
        </Field>
      </div>
      <Field
        label="Note"
        htmlFor="rec_reason"
        hint="Recorded as approved. Annual leave comes off their balance, and they are notified."
      >
        <textarea
          id="rec_reason"
          name="reason"
          rows={2}
          placeholder="Optional"
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
      </Field>
      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording" : "Record leave"}
        </Button>
      </div>
    </form>
  );
}

export function ApprovalButtons({
  ws,
  requestId,
  mode,
}: {
  ws: string;
  requestId: string;
  mode: "endorse" | "decide";
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<LeaveActionState>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(res.success ?? "Done.");
    });

  // Rejecting asks for a word first. The first press shows the note box, the
  // second sends, so a no can carry its reason without a dialog in the way.
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  if (rejecting) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why, in a line. Optional"
          aria-label="Reason for rejecting"
          onKeyDown={(e) => {
            if (e.key === "Escape") setRejecting(false);
            if (e.key === "Enter")
              run(() => decideLeave(ws, requestId, "rejected", note));
          }}
          className="h-8 w-44 rounded-[8px] border border-border bg-surface px-2 text-[12.5px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand"
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => run(() => decideLeave(ws, requestId, "rejected", note))}
        >
          Reject
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
          Keep
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {mode === "endorse" ? (
        <Button size="sm" disabled={pending} onClick={() => run(() => endorseLeave(ws, requestId))}>
          Endorse
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => run(() => decideLeave(ws, requestId, "approved"))}>
          Approve
        </Button>
      )}
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => setRejecting(true)}>
        Reject
      </Button>
    </div>
  );
}

// The yearly allowance per person, edited where the executive reads it.
// Commit on blur or Enter, revert on Escape, the same contract as every
// other inline edit in the app.
export function AllowanceEditor({
  ws,
  year,
  people,
}: {
  ws: string;
  year: number;
  people: { id: string; full_name: string; total: number; used: number }[];
}) {
  const [pending, startTransition] = useTransition();

  const save = (profileId: string, raw: string, before: number) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === before) return;
    startTransition(async () => {
      const res = await setLeaveAllowance(ws, profileId, year, next);
      if (res.error) toast.error(res.error);
      else toast.success(res.success ?? "Saved.");
    });
  };

  return (
    <div className={pending ? "opacity-60" : undefined}>
      {people.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 border-b border-border px-5 py-2 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">
            {p.full_name}
          </span>
          <span className="font-mono text-[12px] text-text-3 tabular">
            {p.used} used
          </span>
          <input
            type="number"
            min={0}
            max={365}
            defaultValue={p.total}
            aria-label={`Annual allowance for ${p.full_name}`}
            onBlur={(e) => save(p.id, e.target.value, p.total)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = String(p.total);
                e.currentTarget.blur();
              }
            }}
            className="h-8 w-16 rounded-[8px] border border-border bg-surface px-2 text-right font-mono text-[13px] text-text-1 tabular outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
          />
        </div>
      ))}
    </div>
  );
}
