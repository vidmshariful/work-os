import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { loadThreads } from "@/lib/data/messages";
import { ThreadList } from "@/components/features/messages/thread-list";

export const metadata: Metadata = { title: "Messages" };

// The people column stays put while the conversation changes, so switching
// threads does not rebuild the list or lose its scroll.
export default async function MessagesLayout({
  params,
  children,
}: {
  params: Promise<{ ws: string }>;
  children: React.ReactNode;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const threads = await loadThreads(ctx.workspace.id, ctx.userId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Messages</h1>
        <p className="mt-0.5 text-sm text-text-2">
          Direct messages with the team. Only the two of you can read one.
        </p>
      </div>
      <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-[14px] border border-border bg-surface">
        <ThreadList ws={ws} me={ctx.userId} threads={threads} />
        {children}
      </div>
    </div>
  );
}
