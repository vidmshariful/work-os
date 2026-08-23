"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Reading and clearing your own notifications. RLS scopes every one of these
// to profile_id = auth.uid(), so none of them needs an ownership check: a
// request for somebody else's row simply matches nothing.
//
// Each takes the workspace slug so it can revalidate the layout that draws the
// bell. Without that the badge is served from a cached render and creeps back
// to its old number the moment you navigate, which looks exactly like marking
// read having failed.

async function refresh(slug?: string) {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  if (slug) revalidatePath(`/${slug}`, "layout");
}

export async function markNotificationRead(id: string, slug?: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  await refresh(slug);
}

export async function markAllNotificationsRead(workspaceId?: string, slug?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", user.id)
    .eq("is_read", false);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  await query;
  await refresh(slug);
}

// Remove one for good. A notification is a nudge, not a record: the thing it
// points at is the record, and it is still there afterwards.
export async function dismissNotification(id: string, slug?: string) {
  const supabase = await createClient();
  await supabase.from("notifications").delete().eq("id", id);
  await refresh(slug);
}

// Clear everything already read, so the hub keeps only what still wants doing.
// Unread rows are never touched: nothing you have not seen disappears.
export async function clearReadNotifications(slug?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .delete()
    .eq("profile_id", user.id)
    .eq("is_read", true);
  await refresh(slug);
}
