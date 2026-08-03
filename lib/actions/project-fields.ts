"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type {
  ProjectFieldKind,
  ProjectFieldOption,
  ProjectFieldValue,
} from "@/lib/types";

export interface FieldActionState {
  error: string | null;
  // What was actually stored, after trimming and coercion. Null when the
  // field ended up empty or the write was refused.
  value?: ProjectFieldValue;
}

const KINDS: ProjectFieldKind[] = [
  "text",
  "long_text",
  "number",
  "date",
  "select",
  "multi_select",
  "url",
  "checkbox",
];

// The same seven the design system draws with, so an option cannot be given
// a colour that has no token behind it.
const COLORS = ["blue", "violet", "green", "amber", "rose", "teal", "gray"];

const MAX_TEXT = 500;
const MAX_LONG_TEXT = 5000;

// Coerce whatever arrived into the shape the kind promises, or refuse it.
// Values are jsonb, so without this a number field would happily store the
// string "banana" and every reader downstream would have to cope.
async function cleanFieldValue(
  kind: ProjectFieldKind,
  options: ProjectFieldOption[],
  raw: unknown
): Promise<{ value: ProjectFieldValue; error: string | null }> {
  // Empty always means empty, whatever the kind. The row is deleted rather
  // than stored as null, so "no value" is one state and not two.
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, error: null };
  }

  switch (kind) {
    case "text":
    case "long_text": {
      const s = String(raw).trim();
      const cap = kind === "text" ? MAX_TEXT : MAX_LONG_TEXT;
      if (s.length > cap) return { value: null, error: `Keep this under ${cap} characters.` };
      return { value: s || null, error: null };
    }
    case "url": {
      const s = String(raw).trim();
      if (s.length > MAX_TEXT) return { value: null, error: "That link is too long." };
      // A link that is not a link is a broken affordance: the field renders
      // as something you can click.
      try {
        const u = new URL(s);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return { value: null, error: "Links must start with http or https." };
        }
      } catch {
        return { value: null, error: "That is not a valid link." };
      }
      return { value: s, error: null };
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { value: null, error: "That is not a number." };
      return { value: n, error: null };
    }
    case "date": {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { value: null, error: "Use a real date." };
      return { value: s, error: null };
    }
    case "checkbox":
      return { value: raw === true || raw === "true", error: null };
    case "select": {
      const s = String(raw);
      if (!options.some((o) => o.value === s)) {
        return { value: null, error: "That is not one of the choices." };
      }
      return { value: s, error: null };
    }
    case "multi_select": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const known = new Set(options.map((o) => o.value));
      if (arr.some((v) => !known.has(v))) {
        return { value: null, error: "One of those is not a choice on this field." };
      }
      return { value: [...new Set(arr)], error: null };
    }
    default:
      return { value: null, error: "That field type is not supported." };
  }
}

// Setting a value is editing the project, so it takes the rule
// projects_update takes: a manager on any project, or the owner on theirs.
// RLS says the same thing; this check exists to give a sentence rather than
// a silent no-op.
export async function setProjectFieldValue(
  ws: string,
  projectId: string,
  fieldId: string,
  raw: unknown
): Promise<FieldActionState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // Independent lookups, so they cost one trip rather than two. The screen
  // shows the new value the moment it is picked, which makes every leg of
  // this worth removing.
  const [{ data: project }, { data: field }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
    supabase
      .from("project_fields")
      .select("id, kind, options")
      .eq("id", fieldId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
  ]);
  if (!project) return { error: "Project not found.", value: null };
  if (!ctx.capabilities.canCreateProjects && project.owner_id !== ctx.userId) {
    return { error: "Only managers or the project owner can change this.", value: null };
  }
  if (!field) return { error: "That field no longer exists.", value: null };

  const { value, error } = await cleanFieldValue(
    field.kind as ProjectFieldKind,
    (field.options ?? []) as ProjectFieldOption[],
    raw
  );
  if (error) return { error, value: null };

  // Empty removes the row. One representation of "not set" beats two, and an
  // unticked checkbox is empty: otherwise ticking and unticking would leave a
  // false behind that the Fields counter would go on counting as filled.
  if (value === null || value === false || (Array.isArray(value) && value.length === 0)) {
    const { data, error: delError } = await supabase
      .from("project_field_values")
      .delete()
      .eq("project_id", projectId)
      .eq("field_id", fieldId)
      .select("project_id");
    if (delError) return { error: "Could not clear the field. Try again.", value: null };
    // Deleting nothing is the normal answer when the field was already empty,
    // and the sound of RLS refusing when it was not. Only the second is an
    // error, so the two are told apart rather than both reported as success.
    if (!data || data.length === 0) {
      const { data: still } = await supabase
        .from("project_field_values")
        .select("project_id")
        .eq("project_id", projectId)
        .eq("field_id", fieldId)
        .maybeSingle();
      if (still) return { error: "You cannot change this project.", value: null };
    }
  } else {
    const { data, error: upError } = await supabase
      .from("project_field_values")
      .upsert(
        { project_id: projectId, field_id: fieldId, value, updated_at: new Date().toISOString() },
        { onConflict: "project_id,field_id" }
      )
      .select("project_id");
    if (upError) return { error: "Could not save the field. Try again.", value: null };
    if (!data || data.length === 0) {
      return { error: "You cannot change this project.", value: null };
    }
  }

  revalidatePath(`/${ws}/projects/${projectId}`);
  // The cleaned value goes back, not the raw one. cleanFieldValue trims text,
  // coerces numbers and dedupes choices, so a screen showing what the person
  // typed can be out of step with what was stored. Now it settles on the
  // stored value without waiting for a page render.
  return { error: null, value: value === false ? null : value };
}

// ---- definitions ----
// Defining a field shapes how the whole studio records work, so it sits with
// the people who manage templates. app_is_manager says the same in RLS.

export interface FieldPatch {
  name?: string;
  kind?: ProjectFieldKind;
  options?: ProjectFieldOption[];
  departmentId?: string | null;
}

function cleanOptions(
  options: ProjectFieldOption[]
): { options: ProjectFieldOption[]; error: string | null } {
  const out: ProjectFieldOption[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    const label = String(o.label ?? "").trim();
    if (!label) continue;
    // The value is what is stored, so it stays stable even if the label is
    // reworded later.
    const value = String(o.value ?? label).trim();
    if (seen.has(value)) return { options: [], error: "Two choices cannot share a value." };
    seen.add(value);
    const color = o.color && COLORS.includes(o.color) ? o.color : null;
    out.push({ value, label, color });
  }
  return { options: out, error: null };
}

export async function createProjectField(
  ws: string,
  patch: FieldPatch
): Promise<FieldActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { error: "Only managers can add fields." };
  }
  const name = (patch.name ?? "").trim();
  if (!name) return { error: "Give the field a name." };
  if (name.length > 60) return { error: "Keep the field name under 60 characters." };
  const kind = patch.kind ?? "text";
  if (!KINDS.includes(kind)) return { error: "That field type is not supported." };

  const { options, error } = cleanOptions(patch.options ?? []);
  if (error) return { error };
  if ((kind === "select" || kind === "multi_select") && options.length === 0) {
    return { error: "A choice field needs at least one choice." };
  }

  const supabase = await createClient();
  if (patch.departmentId) {
    const { data: dept } = await supabase
      .from("departments")
      .select("id")
      .eq("id", patch.departmentId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle();
    if (!dept) return { error: "That space is not available." };
  }

  const { count } = await supabase
    .from("project_fields")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id);

  // No .select() after the insert: project_fields_insert gates on
  // app_is_manager while project_fields_select gates on membership, and the
  // same asymmetry that bites createList would bite here.
  const { error: insertError } = await supabase.from("project_fields").insert({
    workspace_id: ctx.workspace.id,
    department_id: patch.departmentId ?? null,
    name,
    kind,
    options,
    sort_order: count ?? 0,
  });
  if (insertError) return { error: "Could not add the field. Try again." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function updateProjectField(
  ws: string,
  fieldId: string,
  patch: FieldPatch
): Promise<FieldActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { error: "Only managers can change fields." };
  }

  const supabase = await createClient();
  const { data: field } = await supabase
    .from("project_fields")
    .select("id, kind")
    .eq("id", fieldId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!field) return { error: "That field no longer exists." };

  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { error: "The field name cannot be empty." };
    if (name.length > 60) return { error: "Keep the field name under 60 characters." };
    clean.name = name;
  }
  if (patch.options !== undefined) {
    const { options, error } = cleanOptions(patch.options);
    if (error) return { error };
    clean.options = options;
  }
  if (patch.departmentId !== undefined) clean.department_id = patch.departmentId;
  // The kind is deliberately not editable. Changing it would leave every
  // stored value in the old shape, and silently reinterpreting them is worse
  // than making someone create a new field.
  if (Object.keys(clean).length === 0) return { error: null };

  const { data, error } = await supabase
    .from("project_fields")
    .update(clean)
    .eq("id", fieldId)
    .select("id");
  if (error) return { error: "Could not save the field. Try again." };
  if (!data || data.length === 0) return { error: "You cannot change this field." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Deleting a field takes its values with it, by the cascade on
// project_field_values.field_id. The count comes back so the confirmation
// can be checked against what actually happened.
export async function deleteProjectField(
  ws: string,
  fieldId: string
): Promise<{ error: string | null; cleared: number }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { error: "Only managers can remove fields.", cleared: 0 };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("project_field_values")
    .select("project_id", { count: "exact", head: true })
    .eq("field_id", fieldId);

  const { data, error } = await supabase
    .from("project_fields")
    .delete()
    .eq("id", fieldId)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error) return { error: "Could not remove the field. Try again.", cleared: 0 };
  if (!data || data.length === 0) {
    return { error: "You cannot remove this field.", cleared: 0 };
  }

  revalidatePath(`/${ws}`, "layout");
  return { error: null, cleared: count ?? 0 };
}

// Persist a new field order. Fields render in sort_order on every project,
// so this is the one place that decides how the block reads.
export async function reorderProjectFields(
  ws: string,
  orderedIds: string[]
): Promise<FieldActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { error: "Only managers can reorder fields." };
  }
  if (orderedIds.length === 0) return { error: null };

  const supabase = await createClient();
  // Confirm every id belongs to this workspace before writing any of them,
  // so a tampered payload cannot reorder another workspace's fields.
  const { data: owned } = await supabase
    .from("project_fields")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .in("id", orderedIds);
  if ((owned ?? []).length !== orderedIds.length) {
    return { error: "Those fields are not all in this workspace." };
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("project_fields")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { error: "Could not save the new order. Try again." };
  }

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}
