import type { Metadata } from "next";
import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/data/context";
import { loadThreads } from "@/lib/data/messages";
import { ThreadList } from "@/components/features/messages/thread-list";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Messages" };

// The people column stays put while the conversation changes, so switching
// threads does not rebuild the list or lose its scroll.
// The people column, fetched inside its own boundary. A loading.tsx beside
// this file would not help: a layout is not suspended by its own segment's
// loading file, so the await below would still hold the whole screen back.
async function People({ ws }: { ws: string }) {
  const ctx = await getWorkspaceContext(ws);
  const threads = await loadThreads(ctx.workspace.id, ctx.userId);
  return <ThreadList ws={ws} me={ctx.userId} threads={threads} />;
}

function PeopleSkeleton() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-2 border-r border-border p-3">
      <Skeleton className="h-8 w-full rounded-[9px]" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function MessagesLayout({
  params,
  children,
}: {
  params: Promise<{ ws: string }>;
  children: React.ReactNode;
}) {
  const { ws } = await params;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Messages</h1>
        <p className="mt-0.5 text-sm text-text-2">
          Direct messages with the team. Only the two of you can read one.
        </p>
      </div>
      <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-[14px] border border-border bg-surface">
        <Suspense fallback={<PeopleSkeleton />}>
          <People ws={ws} />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
