import { createClient } from "@/lib/supabase/server";
import type { DirectMessage, DirectThread } from "@/lib/types";

// Reads for direct messages. RLS already limits every row to the two people
// in it, so nothing here re-checks who may see what: these functions decide
// what to show, not what is allowed.

// The people you can write to, with the last thing said and how much of it
// you have not read.
//
// The list is the team rather than a history of conversations, because a
// studio of seven does not need a "start a new conversation" step: everyone
// is one click away, and someone you have never messaged reads as an empty
// conversation rather than as absent.
export async function loadThreads(
  workspaceId: string,
  userId: string
): Promise<DirectThread[]> {
  const supabase = await createClient();

  const [{ data: memberRows }, { data: messageRows }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, profile:profiles!profile_id!inner(id, full_name, avatar_url)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    // Every message either way. A studio's traffic is small enough that one
    // read beats a query per person, and RLS has already narrowed it to
    // conversations this reader is in.
    supabase
      .from("direct_messages")
      .select("sender_id, recipient_id, body, created_at, read_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);

  const messages = (messageRows ?? []) as Pick<
    DirectMessage,
    "sender_id" | "recipient_id" | "body" | "created_at" | "read_at"
  >[];

  const lastByPerson = new Map<string, { body: string; created_at: string; mine: boolean }>();
  const unreadByPerson = new Map<string, number>();
  for (const m of messages) {
    const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
    // Ordered newest first, so the first one seen for a person is the last
    // one said.
    if (!lastByPerson.has(other)) {
      lastByPerson.set(other, {
        body: m.body,
        created_at: m.created_at,
        mine: m.sender_id === userId,
      });
    }
    if (m.recipient_id === userId && m.read_at === null) {
      unreadByPerson.set(other, (unreadByPerson.get(other) ?? 0) + 1);
    }
  }

  const people = ((memberRows ?? []) as unknown as {
    role: string | null;
    profile: { id: string; full_name: string; avatar_url: string | null };
  }[])
    .filter((m) => m.profile && m.profile.id !== userId)
    .map((m) => ({
      person: { ...m.profile, role: m.role },
      last: lastByPerson.get(m.profile.id) ?? null,
      unread: unreadByPerson.get(m.profile.id) ?? 0,
    }));

  // Whoever spoke last comes first, then everyone else by name, so the list
  // is a conversation list at the top and a directory below it.
  return people.sort((a, b) => {
    if (a.last && b.last) return b.last.created_at.localeCompare(a.last.created_at);
    if (a.last) return -1;
    if (b.last) return 1;
    return a.person.full_name.localeCompare(b.person.full_name);
  });
}

// One conversation, oldest first, the way a thread reads.
export async function loadConversation(
  workspaceId: string,
  userId: string,
  otherId: string
): Promise<DirectMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("direct_messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    // Both legs of the conversation. RLS would hide anyone else's messages
    // anyway, but saying it here keeps the query honest about its intent.
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherId}),` +
        `and(sender_id.eq.${otherId},recipient_id.eq.${userId})`
    )
    .order("created_at");
  return (data ?? []) as DirectMessage[];
}

// The number on the sidebar. Counted, not fetched, because the badge does not
// need the messages themselves.
export async function unreadMessageCount(
  workspaceId: string,
  userId: string
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("recipient_id", userId)
    .is("read_at", null);
  return count ?? 0;
}
