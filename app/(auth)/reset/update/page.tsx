import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

// Reached after the reset code has been exchanged for a session. If someone
// lands here without one, send them back to request a fresh link.
export default async function ResetUpdatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/reset");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            W
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-text-1">
              Set a new password
            </h1>
            <p className="mt-1 text-sm text-text-2">
              Choose a password you have not used here before.
            </p>
          </div>
        </div>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
