import type { Metadata } from "next";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            W
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-text-1">
              Reset your password
            </h1>
            <p className="mt-1 text-sm text-text-2">
              We will email you a link to set a new one.
            </p>
          </div>
        </div>
        <ResetRequestForm />
      </div>
    </main>
  );
}
