"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Top-level error boundary for routes outside the workspace and personal
// groups (the root and auth screens). Renders standalone, no shell.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-h3 font-semibold text-text-1">Something went wrong</h2>
        <p className="page-subtitle mt-1">
          An unexpected error occurred. You can try again.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
