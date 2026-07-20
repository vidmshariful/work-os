"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";
import type { DbScope, DocKind } from "@/lib/types";

// Docs come in three kinds: a page written here, an uploaded file, or an
// external link. Scope and sharing mirror the tables feature; RLS is the gate.

const BUCKET = "doc-files";
const MAX_BYTES = 25 * 1024 * 1024;

export interface DocState {
  error: string | null;
}

export interface DocCreateState {
  error: string | null;
  id: string | null;
}

function ok() {
  return { error: null };
}

function scopeFor(archetype: string): DbScope {
  return archetype === "executive" || archetype === "domain_manager"
    ? "company"
    : "personal";
}

// ---- create ----

export async function createDoc(
  ws: string,
  title: string,
  kind: DocKind,
  url: string
): Promise<DocCreateState> {
  const ctx = await getWorkspaceContext(ws);
  const clean = title.trim();
  if (!clean) return { error: "Give the doc a title.", id: null };
  if (kind === "link" && !/^https?:\/\//i.test(url.trim())) {
    return { error: "Paste a link starting with http or https.", id: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("docs")
    .insert({
      workspace_id: ctx.workspace.id,
      owner_id: ctx.userId,
      title: clean,
      kind,
      url: kind === "link" ? url.trim() : null,
      content: kind === "page" ? "" : null,
      scope: scopeFor(ctx.membership.archetype),
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the doc.", id: null };

  revalidatePath(`/${ws}/database/docs`);
  return { error: null, id: data.id };
}

// Upload any format. The bucket is private, so reads go through short-lived
// signed URLs issued server-side.
export async function uploadDoc(
  _prev: DocCreateState,
  formData: FormData
): Promise<DocCreateState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", id: null };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Files can be up to 25 MB.", id: null };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${ctx.workspace.id}/${ctx.userId}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: "The upload failed. Try again.", id: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("docs")
    .insert({
      workspace_id: ctx.workspace.id,
      owner_id: ctx.userId,
      title: title || file.name,
      kind: "file",
      file_path: path,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      scope: scopeFor(ctx.membership.archetype),
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Could not save the doc.", id: null };
  }

  revalidatePath(`/${ws}/database/docs`);
  return { error: null, id: data.id };
}

// ---- read helper ----

export async function getDocFileUrl(
  ws: string,
  docId: string
): Promise<{ url: string | null; error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  // RLS decides visibility: if the caller cannot see the doc, there is no row.
  const { data: doc } = await supabase
    .from("docs")
    .select("file_path, workspace_id")
    .eq("id", docId)
    .maybeSingle();
  if (!doc?.file_path || doc.workspace_id !== ctx.workspace.id) {
    return { url: null, error: "File not found." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 600);
  if (error || !data?.signedUrl) {
    return { url: null, error: "Could not prepare the preview." };
  }
  return { url: data.signedUrl, error: null };
}

// ---- update ----

export async function updateDoc(
  ws: string,
  id: string,
  patch: { title?: string; content?: string; url?: string }
): Promise<DocState> {
  await getWorkspaceContext(ws);
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: "The title cannot be empty." };
    clean.title = t;
  }
  if (patch.content !== undefined) clean.content = patch.content;
  if (patch.url !== undefined) {
    const u = patch.url.trim();
    if (u && !/^https?:\/\//i.test(u)) {
      return { error: "Links must start with http or https." };
    }
    clean.url = u || null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("docs").update(clean).eq("id", id);
  if (error) return { error: "Could not save the doc." };

  revalidatePath(`/${ws}/database/docs`);
  revalidatePath(`/${ws}/database/docs/${id}`);
  return ok();
}

export async function deleteDoc(ws: string, id: string): Promise<DocState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("docs")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("docs").delete().eq("id", id);
  if (error) return { error: "Could not delete the doc." };

  if (doc?.file_path) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([doc.file_path]);
  }

  revalidatePath(`/${ws}/database/docs`);
  return ok();
}

export async function setDocScope(
  ws: string,
  id: string,
  scope: DbScope
): Promise<DocState> {
  const ctx = await getWorkspaceContext(ws);
  const contributed =
    scope === "company" && scopeFor(ctx.membership.archetype) === "personal";

  const supabase = await createClient();
  const { error } = await supabase
    .from("docs")
    .update({ scope, contributed: scope === "company" ? contributed : false })
    .eq("id", id);
  if (error) return { error: "Could not change who can see this doc." };

  revalidatePath(`/${ws}/database/docs`);
  revalidatePath(`/${ws}/database/docs/${id}`);
  return ok();
}

export async function setDocShare(
  ws: string,
  docId: string,
  profileId: string,
  canEdit: boolean | null
): Promise<DocState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();

  if (canEdit === null) {
    const { error } = await supabase
      .from("doc_shares")
      .delete()
      .eq("doc_id", docId)
      .eq("profile_id", profileId);
    if (error) return { error: "Could not remove that person." };
  } else {
    const { error } = await supabase
      .from("doc_shares")
      .upsert(
        { doc_id: docId, profile_id: profileId, can_edit: canEdit },
        { onConflict: "doc_id,profile_id" }
      );
    if (error) return { error: "Could not share the doc." };
  }

  revalidatePath(`/${ws}/database/docs/${docId}`);
  return ok();
}
