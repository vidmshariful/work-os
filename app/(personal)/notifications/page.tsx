import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import {
  clearReadNotifications,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import { NotificationHubList } from "@/components/features/notifications/hub-list";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications" };

// The personal hub: every notification across every membership, each tagged
// by workspace. Only member workspaces can ever appear here because the rows
// themselves are scoped by RLS.
export default async function NotificationsHub({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const session = await getSession();
  const supabase = await createClient();

  // Counts come from their own head queries rather than from the page of rows,
  // so the tabs stay honest past the hundred row limit.
  const [{ data }, { count: totalCount }, { count: unreadCount }] = await Promise.all([
    (unreadOnly
      ? supabase.from("notifications").select("*").eq("profile_id", session.userId).eq("is_read", false)
      : supabase.from("notifications").select("*").eq("profile_id", session.userId)
    )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", session.userId),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", session.userId)
      .eq("is_read", false),
  ]);

  const notifications = (data ?? []) as Notification[];
  const workspaces = Object.fromEntries(
    session.memberships.map((m) => [
      m.workspace.id,
      { name: m.workspace.name, slug: m.workspace.slug },
    ])
  );
  const unread = unreadCount ?? 0;
  const total = totalCount ?? 0;
  const readCount = Math.max(0, total - unread);

  const tab = (key: "all" | "unread", label: string, n: number) => {
    const active = (key === "unread") === unreadOnly;
    return (
      <Link
        href={key === "unread" ? "/notifications?filter=unread" : "/notifications"}
        aria-current={active ? "page" : undefined}
        className={cn(
          "rounded-[7px] px-3 py-1 text-body font-medium transition-colors",
          active ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
        )}
      >
        {label}
        <span className="ml-1.5 font-mono text-meta tabular text-text-3">{n}</span>
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle mt-1">
            {unread > 0
              ? `${unread} unread across your workspaces.`
              : "You are all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
            {tab("all", "All", total)}
            {tab("unread", "Unread", unread)}
          </div>
          {unread > 0 ? (
            <form
              action={async () => {
                "use server";
                await markAllNotificationsRead();
              }}
            >
              <button className="h-9 rounded-[9px] border border-border bg-surface px-3.5 text-body font-medium text-text-1 transition-colors hover:bg-surface-2">
                Mark all read
              </button>
            </form>
          ) : null}
          {readCount > 0 ? (
            <form
              action={async () => {
                "use server";
                await clearReadNotifications();
              }}
            >
              <button className="h-9 rounded-[9px] border border-border bg-surface px-3.5 text-body font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1">
                Clear read
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell />}
            title={
              unreadOnly
                ? "Nothing unread. Everything here has been seen."
                : "Notifications will appear here as work moves."
            }
          />
        ) : (
          <NotificationHubList notifications={notifications} workspaces={workspaces} />
        )}
      </Card>
    </div>
  );
}
