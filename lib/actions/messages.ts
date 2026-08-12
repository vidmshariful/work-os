"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";

export interface MessageResult {
  error: string | null;
}

const MAX_BODY = 4000;

// Send one message. RLS is the real gate here, the same as everywhere else:
// it refuses a forged sender, a recipient outside the workspace, and a
// message to yourself. These checks exist to return a sentence instead of a
// silent refusal.
export async function sendDirectMessage(
  ws: string,
  recipientId: string,
  body: string
): Promise<MessageResult> {
  const ctx = await getWorkspaceContext(ws);
  const clean = body.trim();
  if (!clean) return { error: "Write something first." };
  if (clean.length > MAX_BODY) {
    return { error: `Keep a message under ${MAX_BODY} characters.` };
  }
  if (recipientId === ctx.userId) {
    return { error: "You cannot message yourself. Use My To-dos for notes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      workspace_id: ctx.workspace.id,
      sender_id: ctx.userId,
      recipient_id: recipientId,
      body: clean,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "That message could not be sent. Try again." };
  }

  revalidatePath(`/${ws}/messages`);
  return { error: null };
}

// Everything this person sent you, marked read. Only read_at is written, and
// the update policy already limits the rows to ones addressed to you, so a
// crafted call cannot touch anyone else's.
export async function markThreadRead(
  ws: string,
  otherId: string
): Promise<MessageResult> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspace.id)
    .eq("sender_id", otherId)
    .eq("recipient_id", ctx.userId)
    .is("read_at", null);

  if (error) return { error: "Could not mark the conversation read." };
  revalidatePath(`/${ws}/messages`);
  return { error: null };
}

// Unsend. The policy allows only your own, so a wrong id deletes nothing
// rather than someone else's message.
export async function unsendDirectMessage(
  ws: string,
  messageId: string
): Promise<MessageResult> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("direct_messages")
    .delete()
    .eq("id", messageId)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");

  if (error) return { error: "Could not unsend that message." };
  if (!data || data.length === 0) {
    return { error: "That message is not yours to unsend." };
  }
  revalidatePath(`/${ws}/messages`);
  return { error: null };
}
