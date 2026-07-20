"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { DbFieldType, DbScope } from "@/lib/types";

// Airtable-style tables. RLS decides who may read and write; these actions add
// friendly errors and the scope rules on create.

export interface DbState {
  error: string | null;
}

const FIELD_TYPES: DbFieldType[] = [
  "text",
  "long_text",
  "number",
  "date",
  "checkbox",
  "select",
  "multi_select",
  "url",
  "email",
  "phone",
  "person",
];

function ok() {
  return { error: null };
}

function isManager(archetype: string) {
  return archetype === "executive" || archetype === "domain_manager";
}

// ---- tables ----

export async function createTable(
  ws: string,
  name: string,
  description: string,
  color: string
): Promise<{ error: string | null; id: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "Give the table a name.", id: null };

  // Managers build the company database by default; everyone else starts
  // private and can promote later.
  const scope: DbScope = isManager(ctx.membership.archetype) ? "company" : "personal";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("db_tables")
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
  if (error || !data) return { error: "Could not create the table.", id: null };

  // A table is only useful with a first column.
  await supabase
    .from("db_fields")
    .insert({ table_id: data.id, name: "Name", type: "text", sort_order: 0 });

  revalidatePath(`/${ws}/database`);
  return { error: null, id: data.id };
}

export async function updateTable(
  ws: string,
  id: string,
  patch: { name?: string; description?: string | null; color?: string }
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { error: "The name cannot be empty." };
    clean.name = n;
  }
  if (patch.description !== undefined) {
    clean.description = patch.description?.trim() || null;
  }
  if (patch.color !== undefined) clean.color = patch.color;
  if (Object.keys(clean).length === 0) return ok();

  const supabase = await createClient();
  const { error } = await supabase.from("db_tables").update(clean).eq("id", id);
  if (error) return { error: "Could not save the table." };

  revalidatePath(`/${ws}/database`);
  revalidatePath(`/${ws}/database/${id}`);
  return ok();
}

export async function deleteTable(ws: string, id: string): Promise<DbState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("db_tables").delete().eq("id", id);
  if (error) return { error: "Could not delete the table." };

  revalidatePath(`/${ws}/database`);
  return ok();
}

// "Add this to the company database too." Promoting a table someone built for
// themselves marks it as contributed, so it reads as shared by the team.
export async function setTableScope(
  ws: string,
  id: string,
  scope: DbScope
): Promise<DbState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: table } = await supabase
    .from("db_tables")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!table) return { error: "Table not found." };

  const contributed =
    scope === "company" && !isManager(ctx.membership.archetype);
  const { error } = await supabase
    .from("db_tables")
    .update({ scope, contributed: scope === "company" ? contributed : false })
    .eq("id", id);
  if (error) return { error: "Could not change who can see this table." };

  revalidatePath(`/${ws}/database`);
  revalidatePath(`/${ws}/database/${id}`);
  return ok();
}

// ---- fields ----

export async function addField(
  ws: string,
  tableId: string,
  name: string,
  type: DbFieldType,
  choices: string[]
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "Give the field a name." };
  if (!FIELD_TYPES.includes(type)) return { error: "Unknown field type." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("db_fields")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId);

  const palette = ["#3B6FF6", "#7C5CFC", "#16A34A", "#E5486D", "#12A8A0", "#8A94A3"];
  const options =
    type === "select" || type === "multi_select"
      ? {
          choices: choices
            .map((c) => c.trim())
            .filter(Boolean)
            .map((label, i) => ({ label, color: palette[i % palette.length] })),
        }
      : {};

  const { error } = await supabase.from("db_fields").insert({
    table_id: tableId,
    name: clean,
    type,
    options,
    sort_order: count ?? 0,
  });
  if (error) return { error: "Could not add the field." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

export async function renameField(
  ws: string,
  tableId: string,
  fieldId: string,
  name: string
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "The field name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("db_fields")
    .update({ name: clean })
    .eq("id", fieldId);
  if (error) return { error: "Could not rename the field." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

export async function deleteField(
  ws: string,
  tableId: string,
  fieldId: string
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("db_fields").delete().eq("id", fieldId);
  if (error) return { error: "Could not delete the field." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

// ---- rows ----

export async function addRow(ws: string, tableId: string): Promise<DbState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { count } = await supabase
    .from("db_rows")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId);
  const { error } = await supabase.from("db_rows").insert({
    table_id: tableId,
    values: {},
    sort_order: count ?? 0,
    created_by: ctx.userId,
  });
  if (error) return { error: "Could not add the row." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

export async function updateCell(
  ws: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  value: unknown
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("db_rows")
    .select("values")
    .eq("id", rowId)
    .maybeSingle();
  if (!row) return { error: "Row not found." };

  const next = { ...(row.values as Record<string, unknown>) };
  if (value === null || value === "") delete next[fieldId];
  else next[fieldId] = value;

  const { error } = await supabase
    .from("db_rows")
    .update({ values: next })
    .eq("id", rowId);
  if (error) return { error: "Could not save that cell." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

export async function deleteRow(
  ws: string,
  tableId: string,
  rowId: string
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("db_rows").delete().eq("id", rowId);
  if (error) return { error: "Could not delete the row." };

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}

// ---- sharing ----

export async function setTableShare(
  ws: string,
  tableId: string,
  profileId: string,
  canEdit: boolean | null
): Promise<DbState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();

  if (canEdit === null) {
    const { error } = await supabase
      .from("db_shares")
      .delete()
      .eq("table_id", tableId)
      .eq("profile_id", profileId);
    if (error) return { error: "Could not remove that person." };
  } else {
    const { error } = await supabase
      .from("db_shares")
      .upsert(
        { table_id: tableId, profile_id: profileId, can_edit: canEdit },
        { onConflict: "table_id,profile_id" }
      );
    if (error) return { error: "Could not share the table." };
  }

  revalidatePath(`/${ws}/database/${tableId}`);
  return ok();
}
