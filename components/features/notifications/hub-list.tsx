"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Tag } from "@/components/primitives/tag";
import { TimeAgo } from "@/components/primitives/local-time";
import { notificationHref } from "@/lib/notifications";
import {
  dismissNotification,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types";

// The hub rows. Each links to its entity in that notification's own
// workspace; clicking marks it read on the way. Read state and dismissal are
// both optimistic, so a row answers the click immediately and the server
// catches up behind it.
export function NotificationHubList({
  notifications,
  workspaces,
}: {
  notifications: Notification[];
  workspaces: Record<string, { name: string; slug: string }>;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [goneIds, setGoneIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const markRead = (id: string, slug?: string) => {
    setReadIds((prev) => new Set(prev).add(id));
    startTransition(() => {
      void markNotificationRead(id, slug);
    });
  };

  const dismiss = (id: string, slug?: string) => {
    setGoneIds((prev) => new Set(prev).add(id));
    startTransition(() => {
      void dismissNotification(id, slug);
    });
  };

  const visible = notifications.filter((n) => !goneIds.has(n.id));
  if (visible.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-meta text-text-3">
        Nothing left here.
      </p>
    );
  }

  return (
    <>
      {visible.map((n) => {
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
              <p className="text-body font-medium text-text-1">{n.title}</p>
              {n.body ? (
                <p className="mt-0.5 text-meta text-text-2">{n.body}</p>
              ) : null}
              <p className="mt-1 text-label text-text-3"><TimeAgo at={n.created_at} /></p>
            </div>
          </>
        );

        return (
          <div
            key={n.id}
            className="group flex items-start gap-3 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2"
          >
            {href ? (
              <Link
                href={href}
                onClick={() => {
                  if (!isRead) markRead(n.id, ws?.slug);
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
                  onClick={() => markRead(n.id, ws?.slug)}
                  className="rounded-[8px] px-2 py-1 text-meta font-medium text-brand hover:bg-brand-soft"
                >
                  Mark read
                </button>
              ) : null}
              {/* Appears on hover, like every other row action in the app. */}
              <button
                onClick={() => dismiss(n.id, ws?.slug)}
                aria-label={`Dismiss: ${n.title}`}
                className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
