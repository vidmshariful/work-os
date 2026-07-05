import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";

export default function ClientsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-12 w-full" />
          </Card>
        ))}
      </div>
      <Card>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-border px-5 py-4 last:border-b-0">
            <Skeleton className="h-5 w-2/3" />
          </div>
        ))}
      </Card>
    </div>
  );
}
