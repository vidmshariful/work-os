import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";

export default function ClientLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-5">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Skeleton className="h-24 w-full" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-24 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}
