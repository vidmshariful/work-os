"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { DbScope } from "@/lib/types";

// Folders group the Database into things that belong together, and a folder
// is the unit you hand to a person: grant it once and every table and doc
// inside it opens for them. RLS decides all of it, through app_can_see_folder
// and app_can_edit_folder. These actions only add readable errors.

export interface FolderState {
  error: string | null;
}

const ok = () => ({ error: null });

function isManager(archetype: string) {
  return archetype === "executive" || archetype === "domain_manager";
}

function refresh(ws: string, folderId?: string) {
  revalidatePath(`/${ws}/database`);
  revalidatePath(`/${ws}/database/docs`);
  if (folderId) revalidatePath(`/${ws}/database/folders/${folderId}`);
}

export async function createFolder(
  ws: string,
  name: string,
  description: string,
  color: string
): Promise<{ error: string | null; id: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "Give the folder a name.", id: null };

  // The same default a table gets: managers file into the company cabinet,
  // everyone else starts private and grants from there.
  const scope: DbScope = isManager(ctx.membership.archetype) ? "company" : "personal";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("db_folders")
    .insert({
      workspace_id: ctx.workspace.id,
      owner_id: ctx.userId,
      name: clean,
      description: description.trim() || null,
      color: color || "#3B6FF6",
      scope,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the folder.", id: null };

  refresh(ws);
  return { error: null, id: data.id };
}

export async function updateFolder(
  ws: string,
  id: string,
  patch: { name?: string; description?: string | null; color?: string; scope?: DbScope }
): Promise<FolderState> {
  await getWorkspaceContext(ws);
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { error: "The name cannot be empty." };
    clean.name = n;
  }
  if (patch.description !== undefined) clean.description = patch.description?.trim() || null;
  if (patch.color !== undefined) clean.color = patch.color;
  if (patch.scope !== undefined) clean.scope = patch.scope;
  if (Object.keys(clean).length === 0) return ok();

  const supabase = await createClient();
  const { error } = await supabase.from("db_folders").update(clean).eq("id", id);
  if (error) return { error: "Could not save the folder." };

  refresh(ws, id);
  return ok();
}

// The contents survive. Both foreign keys are on delete set null, so the
// tables and docs inside go back to the top level rather than vanishing with
// the folder, which is the behaviour anyone deleting a folder expects.
export async function deleteFolder(ws: string, id: string): Promise<FolderState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("db_folders").delete().eq("id", id);
  if (error) return { error: "Only the owner or an executive can delete a folder." };

  refresh(ws, id);
  return ok();
}

export async function setFolderShare(
  ws: string,
  folderId: string,
  profileId: string,
  canEdit: boolean | null
): Promise<FolderState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();

  if (canEdit === null) {
    const { error } = await supabase
      .from("db_folder_shares")
      .delete()
      .eq("folder_id", folderId)
      .eq("profile_id", profileId);
    if (error) return { error: "Could not remove that person." };
  } else {
    const { error } = await supabase
      .from("db_folder_shares")
      .upsert(
        { folder_id: folderId, profile_id: profileId, can_edit: canEdit },
        { onConflict: "folder_id,profile_id" }
      );
    if (error) return { error: "Could not give that person the folder." };
  }

  refresh(ws, folderId);
  return ok();
}

// Filing. Passing null takes the item back out to the top level. RLS decides
// whether you may write the item at all, and whether you may put things in
// the destination folder, so a stranger cannot file into a folder they only
// have read access to.
export async function moveTableToFolder(
  ws: string,
  tableId: string,
  folderId: string | null
): Promise<FolderState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();

  if (folderId) {
    const { data: folder } = await supabase
      .from("db_folders")
      .select("id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) return { error: "That folder is not available to you." };
  }

  const { data, error } = await supabase
    .from("db_tables")
    .update({ folder_id: folderId })
    .eq("id", tableId)
    .select("id");
  if (error || (data ?? []).length === 0) return { error: "Could not move the table." };

  refresh(ws, folderId ?? undefined);
  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

export async function moveDocToFolder(
  ws: string,
  docId: string,
  folderId: string | null
): Promise<FolderState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();

  if (folderId) {
    const { data: folder } = await supabase
      .from("db_folders")
      .select("id")
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) return { error: "That folder is not available to you." };
  }

  const { data, error } = await supabase
    .from("docs")
    .update({ folder_id: folderId })
    .eq("id", docId)
    .select("id");
  if (error || (data ?? []).length === 0) return { error: "Could not move the document." };

  refresh(ws, folderId ?? undefined);
  revalidatePath(`/${ws}/database/docs/${docId}`);
  return ok();
}
