"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error: string | null;
}

export interface ResetState {
  error: string | null;
  sent: boolean;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email and password do not match." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// Send a reset email. The link lands on /reset/confirm, which exchanges the
// code for a session and forwards to /reset/update. We always report success
// so the form never reveals whether an account exists for the address.
export async function requestPasswordReset(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email.", sent: false };

  const h = await headers();
  const origin =
    h.get("origin") ?? (h.get("host") ? `https://${h.get("host")}` : "");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset/confirm`,
  });
  return { error: null, sent: true };
}

// Set a new password for the current session. Used both by the reset flow
// (after the code exchange authenticates the user) and by the change-password
// section on Account. The caller decides where to go on success.
export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The passwords do not match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session has expired. Request a new reset link." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not update the password. Try again." };
  return { error: null };
}
