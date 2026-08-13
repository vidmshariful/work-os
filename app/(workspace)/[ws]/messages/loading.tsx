import { Skeleton } from "@/components/ui/skeleton";

// The conversation side while the index resolves. The people column has its
// own boundary inside the layout.
export default function MessagesLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <Skeleton className="h-10 w-64 rounded-[12px]" />
    </div>
  );
}
