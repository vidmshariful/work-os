import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";

// Fallback for the personal layer routes while their data loads.
export default function PersonalLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Card>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border px-5 py-4 last:border-b-0">
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </Card>
    </div>
  );
}
