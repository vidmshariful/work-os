import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { loadConversation } from "@/lib/data/messages";
import { Conversation } from "@/components/features/messages/conversation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ ws: string; personId: string }>;
}) {
  const { ws, personId } = await params;
  const ctx = await getWorkspaceContext(ws);
  if (personId === ctx.userId) notFound();

  const supabase = await createClient();
  // Members only, so a profile id from another workspace cannot open a
  // conversation here even though the messages themselves would be empty.
  const { data: member } = await supabase
    .from("memberships")
    .select("profile:profiles!profile_id!inner(id, full_name, avatar_url)")
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", personId)
    .eq("is_active", true)
    .maybeSingle();
  const other = (member as unknown as {
    profile: { id: string; full_name: string; avatar_url: string | null };
  } | null)?.profile;
  if (!other) notFound();

  const messages = await loadConversation(ctx.workspace.id, ctx.userId, personId);

  return (
    <Conversation
      key={personId}
      ws={ws}
      me={ctx.userId}
      other={other}
      initial={messages}
    />
  );
}
