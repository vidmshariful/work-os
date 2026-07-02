import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { Tag } from "@/components/primitives/tag";
import { EmptyState } from "@/components/primitives/empty-state";
import { fmtTimeAgo } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
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
  const wsById = new Map(session.memberships.map((m) => [m.workspace.id, m.workspace]));
  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Notifications</h1>
          <p className="mt-1 text-sm text-text-2">
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
            <button className="h-9 rounded-[9px] border border-border bg-surface px-3.5 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2">
              Mark all read
            </button>
          </form>
        ) : null}
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell />} title="Notifications will appear here as work moves." />
        ) : (
          notifications.map((n) => {
            const ws = wsById.get(n.workspace_id);
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
              >
                <span className={`mt-2 size-1.5 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-brand"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-1">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-[12.5px] text-text-2">{n.body}</p> : null}
                  <p className="mt-1 text-[11.5px] text-text-3">{fmtTimeAgo(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ws ? <Tag tone="blue">{ws.name}</Tag> : null}
                  {!n.is_read ? (
                    <form
                      action={async () => {
                        "use server";
                        await markNotificationRead(n.id);
                      }}
                    >
                      <button className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
