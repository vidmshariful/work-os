import { Skeleton } from "@/components/ui/skeleton";

// The floating panel's own skeleton, so clicking a project answers instantly
// with the panel and the content streams into it. This boundary lives inside
// the @modal slot, so the list behind the panel is never replaced by it.
export default function ProjectModalLoading() {
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]">
      <div className="fixed left-1/2 top-1/2 flex h-[calc(100dvh-4rem)] w-[min(1120px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-border bg-canvas shadow-[var(--shadow-pop)]">
        <div className="flex shrink-0 justify-end gap-1 border-b border-border bg-surface px-3 py-2">
          <Skeleton className="size-7 rounded-[8px]" />
          <Skeleton className="size-7 rounded-[8px]" />
        </div>
        <div className="flex flex-1 flex-col gap-4 px-5 py-5">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-8 w-96" />
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-44 w-full rounded-[14px]" />
              <Skeleton className="h-56 w-full rounded-[14px]" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32 w-full rounded-[14px]" />
              <Skeleton className="h-40 w-full rounded-[14px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
