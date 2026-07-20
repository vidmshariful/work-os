"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Field } from "@/components/primitives/field";
import { updatePassword, type AuthState } from "@/lib/actions/auth";

const initialState: AuthState = { error: null };

const inputClass =
  "h-10 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state === initialState) return;
    if (state.error) toast.error(state.error);
    else {
      toast.success("Password updated.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-sm flex-col gap-4">
      <Field label="New password" htmlFor="new_password">
        <input
          id="new_password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm_password">
        <input
          id="confirm_password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Repeat the password"
          className={inputClass}
        />
      </Field>
      <div>
        <button
          disabled={pending}
          className="h-9 rounded-[9px] bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-black disabled:opacity-60"
        >
          {pending ? "Updating" : "Update password"}
        </button>
      </div>
    </form>
  );
}
