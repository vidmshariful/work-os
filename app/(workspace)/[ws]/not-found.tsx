import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when a workspace record is missing or the viewer has no access to it.
// It reads as a plain absence, never as a hint that something is hidden.
export default function WorkspaceNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <Compass className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-1">Not found</h2>
        <p className="mt-1 text-sm text-text-2">
          This page or record does not exist, or it is not available to you.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
