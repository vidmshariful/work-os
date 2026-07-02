"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/actions/auth";

const initialState: AuthState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form
      action={formAction}
      className="rounded-[14px] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-[12.5px] font-medium text-text-2"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@vidiosa.com"
            className="h-10 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-[12.5px] font-medium text-text-2"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            className="h-10 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
          />
        </div>
        {state.error ? (
          <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-[9px] bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-black disabled:opacity-60"
        >
          {pending ? "Signing in" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
