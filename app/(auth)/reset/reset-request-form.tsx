"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ResetState } from "@/lib/actions/auth";

const initialState: ResetState = { error: null, sent: false };

const inputClass =
  "h-10 rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function ResetRequestForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState
  );

  if (state.sent) {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <p className="text-body text-text-1">
          If an account exists for that email, a reset link is on its way. The
          link opens a page where you can set a new password.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-body font-medium text-brand hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-[14px] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-meta font-medium text-text-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@vidiosa.com"
            className={inputClass}
          />
        </div>
        {state.error ? (
          <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-[9px] bg-primary text-body font-medium text-primary-foreground transition-colors hover:bg-black disabled:opacity-60"
        >
          {pending ? "Sending" : "Send reset link"}
        </button>
        <Link
          href="/login"
          className="text-center text-body font-medium text-text-2 hover:text-text-1"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
