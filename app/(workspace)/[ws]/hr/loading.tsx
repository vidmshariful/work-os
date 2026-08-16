import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/primitives/page-skeleton";

// Two columns: the queues and requests on the left, balance and the form on
// the right, which is the shape the page settles into.
export default function HrLoading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <RowsSkeleton rows={4} />
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-3 h-2 w-full" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-40 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}
