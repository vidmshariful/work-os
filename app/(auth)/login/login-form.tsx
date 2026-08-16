"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "@/lib/actions/auth";

const initialState: AuthState = { error: null };

const inputClass =
  "h-10 rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  wall: "above" | "below";
}

export function LoginForm({
  demoAccounts,
  demoPassword,
}: {
  demoAccounts?: DemoAccount[];
  demoPassword?: string;
}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Which demo row is mid sign-in, so only that row shows the pending label.
  const [submitting, setSubmitting] = useState<string | null>(null);

  // A rejected sign-in returns here instead of redirecting, so clear the row.
  useEffect(() => {
    if (!pending) setSubmitting(null);
  }, [pending]);

  return (
    <>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-meta font-medium text-text-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {pending ? "Signing in" : "Sign in"}
          </button>
          <Link
            href="/reset"
            className="text-center text-body font-medium text-text-2 hover:text-text-1"
          >
            Forgot password?
          </Link>
        </div>
      </form>

      {demoAccounts && demoAccounts.length > 0 ? (
        <div className="mt-4 rounded-[14px] border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-body font-semibold text-text-1">Demo accounts</h2>
            <span className="text-label text-text-3">Click to sign in</span>
          </div>
          <div className="mt-2 flex flex-col">
            {demoAccounts.map((a) => (
              // One form per account so the click carries its own credentials
              // straight to the action. No state round trip, no second click.
              <form
                key={a.email}
                action={formAction}
                onSubmit={() => setSubmitting(a.email)}
              >
                <input type="hidden" name="email" value={a.email} />
                <input type="hidden" name="password" value={demoPassword ?? ""} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-meta font-medium text-text-1">
                      {a.name}
                    </span>
                    <span className="block truncate font-mono text-label text-text-3">
                      {a.email}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-label text-text-2">{a.role}</span>
                    {submitting === a.email ? (
                      <span className="text-micro font-medium text-brand">
                        Signing in
                      </span>
                    ) : (
                      <span className="rounded-full bg-chip-gray px-1.5 py-0.5 text-micro font-medium text-text-2">
                        {a.wall} wall
                      </span>
                    )}
                  </span>
                </button>
              </form>
            ))}
          </div>
          {demoPassword ? (
            <p className="mt-2 border-t border-border pt-2 text-label text-text-3">
              Password for all:{" "}
              <span className="font-mono text-text-1">{demoPassword}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
