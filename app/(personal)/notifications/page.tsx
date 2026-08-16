import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { NotificationHubList } from "@/components/features/notifications/hub-list";
import type { Notification } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications" };

// The personal hub: every notification across every membership, each tagged
// by workspace. Only member workspaces can ever appear here because the rows
// themselves are scoped by RLS.
export default async function NotificationsHub() {
  const session = await getSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as Notification[];
  const workspaces = Object.fromEntries(
    session.memberships.map((m) => [
      m.workspace.id,
      { name: m.workspace.name, slug: m.workspace.slug },
    ])
  );
  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle mt-1">
            {unread > 0 ? `${unread} unread across your workspaces.` : "You are all caught up."}
          </p>
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
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell />} title="Notifications will appear here as work moves." />
        ) : (
          <NotificationHubList notifications={notifications} workspaces={workspaces} />
        )}
      </Card>
    </div>
  );
}
