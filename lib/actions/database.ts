"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import {
  decryptSecret,
  encryptSecret,
  hasSecretKey,
  isEncrypted,
  verifyRoundTrip,
} from "@/lib/secrets";
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
  "secret",
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

  // A secret field never stores what was typed. The field's type is read
  // from the database rather than trusted from the caller, so a crafted
  // request cannot ask for a credential to be written in the clear.
  const [{ data: row }, { data: field }] = await Promise.all([
    supabase.from("db_rows").select("values").eq("id", rowId).maybeSingle(),
    supabase.from("db_fields").select("type").eq("id", fieldId).maybeSingle(),
  ]);
  if (!row) return { error: "Row not found." };
  if (!field) return { error: "Field not found." };

  let stored = value;
  if (field.type === "secret" && value !== null && value !== "") {
    if (!hasSecretKey()) {
      return { error: "Secrets cannot be saved: the encryption key is not set on this server." };
    }
    if (typeof value !== "string") return { error: "A secret has to be text." };
    try {
      stored = encryptSecret(value);
    } catch {
      return { error: "That secret could not be encrypted, so nothing was saved." };
    }
  }

  const next = { ...(row.values as Record<string, unknown>) };
  if (value === null || value === "") delete next[fieldId];
  else next[fieldId] = stored;

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

// ---- secrets ----

// Hands back one stored credential, and records that it happened. The read
// runs under the caller's own login, so RLS is what decides whether they get
// the row at all: if they cannot see the table, there is nothing to decrypt.
export async function revealSecret(
  ws: string,
  tableId: string,
  rowId: string,
  fieldId: string,
  action: "reveal" | "copy" = "reveal"
): Promise<{ error: string | null; value: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("db_rows")
    .select("values, table_id")
    .eq("id", rowId)
    .eq("table_id", tableId)
    .maybeSingle();
  if (!row) return { error: "That row is not available to you.", value: null };

  const raw = (row.values as Record<string, unknown>)[fieldId];
  if (raw === undefined || raw === null || raw === "") {
    return { error: null, value: "" };
  }

  // A value typed before the field became a secret is still plain text. It
  // reads back as it is rather than failing, and the converter below is what
  // turns the whole column into ciphertext.
  let value: string | null;
  if (isEncrypted(raw)) {
    if (!hasSecretKey()) {
      return { error: "The encryption key is not set on this server.", value: null };
    }
    value = decryptSecret(raw);
    if (value === null) {
      return {
        error: "That value could not be decrypted. It was stored with a different key.",
        value: null,
      };
    }
  } else {
    value = String(raw);
  }

  // The trail is written after the value is in hand and before it is
  // returned, so a reveal that reaches the caller is always a reveal that was
  // recorded. A failure here is not fatal: RLS already allowed the read, and
  // refusing to return it would not un-read it.
  await supabase.from("secret_reveals").insert({
    workspace_id: ctx.workspace.id,
    table_id: tableId,
    row_id: rowId,
    field_id: fieldId,
    actor_id: ctx.userId,
    action,
  });

  return { error: null, value };
}

// Turns an existing column into a secret and encrypts everything already in
// it. This is the path for a Password column that has been sitting in plain
// text: the values are read, encrypted, written back, and only then does the
// field change type.
export async function convertFieldToSecret(
  ws: string,
  tableId: string,
  fieldId: string
): Promise<DbState> {
  await getWorkspaceContext(ws);
  if (!hasSecretKey()) {
    return { error: "The encryption key is not set on this server, so nothing was changed." };
  }
  // Proves the key works both ways before a single row is rewritten. Without
  // this a broken key would turn every value into ciphertext nobody can read.
  if (!verifyRoundTrip("work-os round trip")) {
    return { error: "The encryption key failed its own check, so nothing was changed." };
  }

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("db_rows")
    .select("id, values")
    .eq("table_id", tableId);
  if (readError) return { error: "Could not read the rows." };

  for (const r of (rows ?? []) as { id: string; values: Record<string, unknown> }[]) {
    const current = r.values?.[fieldId];
    if (current === undefined || current === null || current === "") continue;
    if (isEncrypted(current)) continue;
    const { error } = await supabase
      .from("db_rows")
      .update({ values: { ...r.values, [fieldId]: encryptSecret(String(current)) } })
      .eq("id", r.id);
    // Stopping here leaves the field as plain text, which is the honest
    // state: a half converted column that still says "text" is recoverable,
    // one that says "secret" while holding plain values is not.
    if (error) return { error: "Could not encrypt every value, so the field was left as it was." };
  }

  const { error } = await supabase
    .from("db_fields")
    .update({ type: "secret" })
    .eq("id", fieldId);
  if (error) return { error: "The values were encrypted but the field type did not change." };

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
