"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PersonAvatar } from "@/components/primitives/avatar";
import { CountBadge } from "@/components/primitives/misc";
import { TimeAgo } from "@/components/primitives/local-time";
import { cn } from "@/lib/utils";
import type { DirectThread } from "@/lib/types";

// The left column: everyone you can write to, whoever spoke last at the top.
// A person you have never messaged is in the same list rather than behind a
// "new conversation" button, because in a studio of seven that button is
// only ever in the way.
export function ThreadList({
  ws,
  me,
  threads,
  activeId,
}: {
  ws: string;
  me: string;
  threads: DirectThread[];
  activeId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");

  // A message from anyone re-reads the list, so the order and the unread
  // counts are right without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`dm-list-${me}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${me}`,
        },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, me, router]);

  const shown = q.trim()
    ? threads.filter((t) =>
        t.person.full_name.toLowerCase().includes(q.trim().toLowerCase())
      )
    : threads;

  return (
    <div className="flex min-h-0 w-[260px] shrink-0 flex-col border-r border-border">
      <div className="shrink-0 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3"
            strokeWidth={1.5}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a teammate"
            aria-label="Find a teammate"
            className="h-8 w-full rounded-[9px] border border-border bg-surface pl-7.5 pr-2 text-meta text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-meta text-text-3">
            Nobody by that name.
          </p>
        ) : null}
        {shown.map((t) => (
          <Link
            key={t.person.id}
            href={`/${ws}/messages/${t.person.id}`}
            aria-current={activeId === t.person.id ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-surface-2",
              activeId === t.person.id && "bg-nav-active"
            )}
          >
            <PersonAvatar
              name={t.person.full_name}
              src={t.person.avatar_url}
              size={32}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body text-text-1",
                    t.unread > 0 && "font-semibold"
                  )}
                >
                  {t.person.full_name}
                </span>
                {t.last ? (
                  <TimeAgo
                    at={t.last.created_at}
                    className="shrink-0 text-micro text-text-3"
                  />
                ) : null}
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-meta",
                    t.unread > 0 ? "text-text-1" : "text-text-3"
                  )}
                >
                  {t.last
                    ? `${t.last.mine ? "You: " : ""}${t.last.body}`
                    : "No messages yet"}
                </span>
                {t.unread > 0 ? <CountBadge count={t.unread} /> : null}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
