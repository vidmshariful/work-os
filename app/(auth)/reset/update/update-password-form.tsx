"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePassword, type AuthState } from "@/lib/actions/auth";

const initialState: AuthState = { error: null };

const inputClass =
  "h-10 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState
  );

  useEffect(() => {
    if (state === initialState) return;
    if (!state.error) {
      toast.success("Password updated.");
      router.replace("/dashboard");
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="rounded-[14px] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[12.5px] font-medium text-text-2">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-[12.5px] font-medium text-text-2">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Repeat the password"
            className={inputClass}
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
          {pending ? "Saving" : "Set new password"}
        </button>
      </div>
    </form>
  );
}
