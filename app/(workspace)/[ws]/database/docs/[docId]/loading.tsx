import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";

export default function DocLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-80" />
      <Card className="p-6">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-11/12" />
        <Skeleton className="mt-2 h-4 w-4/5" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </Card>
    </div>
  );
}
