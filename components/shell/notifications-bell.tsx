"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtTimeAgo } from "@/lib/format";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

export function NotificationsBell({
  userId,
  workspaceId,
  initialCount,
}: {
  userId: string;
  workspaceId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState<Notification[] | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          if (row.workspace_id === workspaceId) {
            setCount((c) => c + 1);
            setItems((prev) => (prev ? [row, ...prev].slice(0, 8) : prev));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, workspaceId]);

  async function loadLatest() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(8);
    setItems((data ?? []) as Notification[]);
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && loadLatest()}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-[9px] text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Bell className="size-[18px] stroke-[1.5]" />
          {count > 0 ? (
            <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-surface" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text-1">Notifications</span>
          {count > 0 ? (
            <button
              onClick={async () => {
                setCount(0);
                setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? null);
                await markAllNotificationsRead(workspaceId);
              }}
              className="text-[12px] font-medium text-brand hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {items === null ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-text-3">Loading</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-text-3">
              You are all caught up.
            </p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className="flex gap-2.5 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-1">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-text-2">{n.body}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11.5px] text-text-3">{fmtTimeAgo(n.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-2">
          <Link href="/notifications" className="text-[12.5px] font-medium text-brand hover:underline">
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
