import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// Top-level 404 for paths outside any workspace.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <Compass className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-1">Page not found</h2>
        <p className="mt-1 text-sm text-text-2">
          The page you are looking for does not exist.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
