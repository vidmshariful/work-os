"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  decideLeave,
  endorseLeave,
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

export function CancelLeaveButton({ ws, requestId }: { ws: string; requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelLeaveRequest(ws, requestId);
          if (res.error) toast.error(res.error);
          else toast.success(res.success ?? "Cancelled.");
        })
      }
    >
      Cancel
    </Button>
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

  if (mode === "endorse") {
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={pending} onClick={() => run(() => endorseLeave(ws, requestId))}>
          Endorse
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => run(() => decideLeave(ws, requestId, "rejected"))}
        >
          Reject
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => run(() => decideLeave(ws, requestId, "approved"))}>
        Approve
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => run(() => decideLeave(ws, requestId, "rejected"))}
      >
        Reject
      </Button>
    </div>
  );
}
