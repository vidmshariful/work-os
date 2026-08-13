import { Skeleton } from "@/components/ui/skeleton";

// The conversation pane only: the thread list lives in the layout above this
// boundary, so switching people keeps it on screen while the messages load.
export default function ConversationLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-5 py-4">
        <Skeleton className="h-10 w-2/5 self-start rounded-[14px]" />
        <Skeleton className="h-14 w-1/2 self-end rounded-[14px]" />
        <Skeleton className="h-10 w-1/3 self-start rounded-[14px]" />
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <Skeleton className="h-11 w-full rounded-[12px]" />
      </div>
    </div>
  );
}
