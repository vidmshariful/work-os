"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Tag } from "@/components/primitives/tag";
import { TimeAgo } from "@/components/primitives/local-time";
import { notificationHref } from "@/lib/notifications";
import { markNotificationRead } from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types";

// The hub rows. Each links to its entity in that notification's own
// workspace; clicking marks it read on the way. A "Mark read" button covers
// notifications that have nothing to open. Read state is optimistic: ids added
// to the overlay render as read immediately, while the server catches up.
export function NotificationHubList({
  notifications,
  workspaces,
}: {
  notifications: Notification[];
  workspaces: Record<string, { name: string; slug: string }>;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const markRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
    startTransition(() => {
      void markNotificationRead(id);
    });
  };

  return (
    <>
      {notifications.map((n) => {
        const isRead = n.is_read || readIds.has(n.id);
        const ws = workspaces[n.workspace_id];
        const href = ws
          ? notificationHref(ws.slug, n.entity_type, n.entity_id)
          : null;

        const body = (
          <>
            <span
              className={`mt-2 size-1.5 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-brand"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-1">{n.title}</p>
              {n.body ? (
                <p className="mt-0.5 text-[12.5px] text-text-2">{n.body}</p>
              ) : null}
              <p className="mt-1 text-[11.5px] text-text-3"><TimeAgo at={n.created_at} /></p>
            </div>
          </>
        );

        return (
          <div
            key={n.id}
            className="flex items-start gap-3 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2"
          >
            {href ? (
              <Link
                href={href}
                onClick={() => {
                  if (!isRead) markRead(n.id);
                }}
                className="flex min-w-0 flex-1 items-start gap-3"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {ws ? <Tag tone="blue">{ws.name}</Tag> : null}
              {!isRead ? (
                <button
                  onClick={() => markRead(n.id)}
                  className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft"
                >
                  Mark read
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
