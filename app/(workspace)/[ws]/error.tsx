"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Error boundary for workspace routes. The shell stays mounted; this replaces
// only the content region and offers a retry.
export default function WorkspaceError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-h3 font-semibold text-text-1">Something went wrong</h2>
        <p className="page-subtitle mt-1">
          This screen hit an error. You can try loading it again.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
