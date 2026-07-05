"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";

// The client workroom: contacts, payments, documents, discussion, to-dos,
// notes. Writes run under the USER client, where the above-wall RLS on
// every table is the gate. The admin client appears only for storage and
// for mention notifications, both after the RLS-checked write succeeded.

export interface WorkroomState {
  error: string | null;
}

const BUCKET = "project-files";
const MAX_DOC_BYTES = 50 * 1024 * 1024;

function refresh(ws: string, clientId: string) {
  revalidatePath(`/${ws}/clients/${clientId}`);
}

// ---- contacts ----

export async function addContact(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  await getWorkspaceContext(ws);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter the contact's name." };
  const email = String(formData.get("email") ?? "").trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    name,
    email: email || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    role_label: String(formData.get("role_label") ?? "").trim() || null,
    is_primary: formData.get("is_primary") === "on",
  });
  if (error) return { error: "Could not add the contact." };

  refresh(ws, clientId);
  return { error: null };
}

export async function deleteContact(ws: string, clientId: string, contactId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase.from("client_contacts").delete().eq("id", contactId);
  refresh(ws, clientId);
}

export async function setPrimaryContact(ws: string, clientId: string, contactId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId);
  await supabase.from("client_contacts").update({ is_primary: true }).eq("id", contactId);
  refresh(ws, clientId);
}

// ---- payments ----

export async function addPayment(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const ctx = await getWorkspaceContext(ws);

  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (!label) return { error: "Give the payment a label." };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter a valid amount." };

  const invoiceUrl = String(formData.get("invoice_url") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.from("client_payments").insert({
    client_id: clientId,
    label,
    amount,
    due_date: String(formData.get("due_date") ?? "") || null,
    invoice_url: invoiceUrl ? (/^https?:\/\//i.test(invoiceUrl) ? invoiceUrl : `https://${invoiceUrl}`) : null,
    created_by: ctx.userId,
  });
  if (error) return { error: "Could not add the payment." };

  refresh(ws, clientId);
  return { error: null };
}

export async function markPaymentPaid(ws: string, clientId: string, paymentId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_payments")
    .update({ paid_at: new Date().toISOString() })
    .eq("id", paymentId)
    .is("paid_at", null);
  refresh(ws, clientId);
  return { error: error ? "Could not mark this payment as paid." : null };
}

export async function deletePayment(ws: string, clientId: string, paymentId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase.from("client_payments").delete().eq("id", paymentId);
  refresh(ws, clientId);
}

// ---- documents ----

async function assertAboveWallForClient(clientId: string): Promise<boolean> {
  // RLS truth: if the user can read the client's contacts table row space,
  // they are above the wall for this client. A cheap definitive probe.
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_contacts")
    .select("id", { head: true, count: "exact" })
    .eq("client_id", clientId);
  return !error;
}

export async function uploadClientDocument(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.wall_side !== "above") {
    return { error: "Documents live above the wall." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const docType = String(formData.get("doc_type") ?? "other");
  const contractStatus = String(formData.get("contract_status") ?? "none");
  const externalUrl = String(formData.get("external_url") ?? "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (!title) return { error: "Give the document a title." };
  if (!hasFile && !externalUrl) return { error: "Attach a file or paste a link." };
  if (hasFile && (file as File).size > MAX_DOC_BYTES) {
    return { error: "Files can be up to 50 MB." };
  }

  let storagePath: string | null = null;
  if (hasFile) {
    const f = file as File;
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    storagePath = `clients/${ctx.workspace.id}/${clientId}/${Date.now()}-${safeName}`;
    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, f, {
      contentType: f.type || "application/octet-stream",
    });
    if (error) return { error: "The upload failed. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("client_documents").insert({
    client_id: clientId,
    title,
    doc_type: ["contract", "proposal", "other"].includes(docType) ? docType : "other",
    contract_status: ["none", "draft", "sent", "signed"].includes(contractStatus)
      ? contractStatus
      : "none",
    storage_path: storagePath,
    external_url: externalUrl
      ? /^https?:\/\//i.test(externalUrl)
        ? externalUrl
        : `https://${externalUrl}`
      : null,
    created_by: ctx.userId,
  });
  if (error) return { error: "Could not save the document." };

  refresh(ws, clientId);
  return { error: null };
}

export async function getClientDocumentUrl(
  ws: string,
  clientId: string,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!(await assertAboveWallForClient(clientId))) {
    return { url: null, error: "Document not found." };
  }
  if (!path.startsWith(`clients/${ctx.workspace.id}/${clientId}/`)) {
    return { url: null, error: "Document not found." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return { url: null, error: "Could not prepare the download." };
  return { url: data.signedUrl, error: null };
}

export async function deleteClientDocument(ws: string, clientId: string, docId: string) {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("client_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  const { error } = await supabase.from("client_documents").delete().eq("id", docId);
  if (!error && doc?.storage_path?.startsWith(`clients/${ctx.workspace.id}/`)) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([doc.storage_path]);
  }
  refresh(ws, clientId);
}

// ---- the activity thread ----

export async function postClientMessage(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const mentioned = String(formData.get("mentioned") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ctx = await getWorkspaceContext(ws);
  if (!body) return { error: "Write a message first." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_activity").insert({
    client_id: clientId,
    kind: "message",
    author_id: ctx.userId,
    body,
  });
  if (error) return { error: "The message could not be posted." };

  // Mentions notify, but only people who are above the wall in this
  // workspace: nobody below the wall can be pulled into a client thread.
  if (mentioned.length > 0) {
    const { data: eligible } = await supabase
      .from("memberships")
      .select("profile_id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("wall_side", "above")
      .eq("is_active", true)
      .in("profile_id", mentioned);
    const { data: clientRow } = await supabase
      .from("v_clients")
      .select("code")
      .eq("id", clientId)
      .maybeSingle();
    const admin = createAdminClient();
    for (const m of eligible ?? []) {
      if (m.profile_id === ctx.userId) continue;
      await admin.from("notifications").insert({
        profile_id: m.profile_id,
        workspace_id: ctx.workspace.id,
        type: "client_mention",
        title: `${ctx.profile.full_name} mentioned you on ${clientRow?.code ?? "a client"}`,
        body: body.slice(0, 140),
        entity_type: "client",
        entity_id: clientId,
      });
    }
  }

  refresh(ws, clientId);
  return { error: null };
}

// ---- to-dos ----

export async function addClientTodo(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const ctx = await getWorkspaceContext(ws);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the to-do a title." };
  const assignee = String(formData.get("assignee_id") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("client_todos").insert({
    client_id: clientId,
    title,
    assignee_id: assignee || null,
    due_date: String(formData.get("due_date") ?? "") || null,
    created_by: ctx.userId,
  });
  if (error) return { error: "Could not add the to-do." };

  refresh(ws, clientId);
  return { error: null };
}

export async function toggleClientTodo(
  ws: string,
  clientId: string,
  todoId: string,
  isDone: boolean
) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_todos")
    .update({ is_done: isDone })
    .eq("id", todoId);
  refresh(ws, clientId);
  return { error: error ? "Could not update the to-do." : null };
}

export async function deleteClientTodo(ws: string, clientId: string, todoId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase.from("client_todos").delete().eq("id", todoId);
  refresh(ws, clientId);
}

// ---- notes ----

export async function addClientNote(
  _prev: WorkroomState,
  formData: FormData
): Promise<WorkroomState> {
  const ws = String(formData.get("ws") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const ctx = await getWorkspaceContext(ws);
  if (!body) return { error: "Write the note first." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_notes").insert({
    client_id: clientId,
    author_id: ctx.userId,
    body,
  });
  if (error) return { error: "Could not save the note." };

  refresh(ws, clientId);
  return { error: null };
}

export async function deleteClientNote(ws: string, clientId: string, noteId: string) {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase.from("client_notes").delete().eq("id", noteId);
  refresh(ws, clientId);
}
