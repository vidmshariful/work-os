import type { Metadata } from "next";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-body font-semibold text-primary-foreground">
            W
          </div>
          <div className="text-center">
            <h1 className="text-h2 font-semibold tracking-tight text-text-1">
              Reset your password
            </h1>
            <p className="page-subtitle mt-1">
              We will email you a link to set a new one.
            </p>
          </div>
        </div>
        <ResetRequestForm />
      </div>
    </main>
  );
}
