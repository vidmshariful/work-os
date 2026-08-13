import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/primitives/card";

// The building blocks every route's loading.tsx composes, so ten skeletons
// stay one vocabulary: title where the title goes, rows where the rows go.
//
// A WARNING TO WHOEVER ADDS THE NEXT ONE. A loading.tsx is a Suspense
// boundary, and a boundary above the space page or a list page stops their
// query-string navigation from ever committing: the view tabs and filters
// fire their request and silently drop it. That is why there is no
// loading.tsx at the workspace level, none under departments/, and why every
// file that composes these blocks was added one at a time with its page's
// query navigation tested against a production build. Do not add a global
// one back, and test any page that rewrites its own search params.

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-12 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-b-0"
        >
          <Skeleton className="size-2.5 rounded-full" />
          <Skeleton className="h-4 w-2/5" />
          <span className="flex-1" />
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </Card>
  );
}

export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </Card>
      ))}
    </div>
  );
}

// A full page: header, then whatever body fits the route.
export function PageSkeleton({
  body = "rows",
}: {
  body?: "rows" | "cards" | "stats-rows" | "form" | "calendar" | "board";
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeaderSkeleton />
      {body === "form" ? (
        <FormSkeleton />
      ) : body === "calendar" ? (
        <CalendarSkeleton />
      ) : body === "board" ? (
        <BoardSkeleton />
      ) : body === "stats-rows" ? (
        <>
          <StatRowSkeleton />
          <RowsSkeleton rows={5} />
        </>
      ) : body === "cards" ? (
        <CardsSkeleton />
      ) : (
        <RowsSkeleton />
      )}
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-28 self-end" />
      </div>
    </Card>
  );
}

// A record with a main column and a rail: a project, a task, a person.
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
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
  );
}

// A month grid, so the calendar does not jump from nothing to six rows.
export function CalendarSkeleton() {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[10px]" />
        ))}
      </div>
    </Card>
  );
}

// Columns of cards: a board, or the todos workspace.
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-3.5">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="mt-2.5 h-3 w-1/2" />
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
