"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";

// Lists are the buckets inside a department. Leads and up manage them; RLS is
// the real gate, these checks only produce friendly errors.

export interface ListActionState {
  error: string | null;
}

export interface DeptActionState {
  error: string | null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "department";
}

// ---- department management (executives) ----

export async function createDepartment(
  ws: string,
  name: string,
  accentColor: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage departments." };
  }
  const clean = name.trim();
  if (!clean) return { error: "Give the department a name." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("departments")
    .select("slug, sort_order")
    .eq("workspace_id", ctx.workspace.id);
  const slugs = new Set((existing ?? []).map((d) => d.slug as string));
  let slug = slugify(clean);
  if (slugs.has(slug)) {
    let i = 2;
    while (slugs.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }
  const maxOrder = Math.max(
    -1,
    ...(existing ?? []).map((d) => d.sort_order as number)
  );

  const { error } = await supabase.from("departments").insert({
    workspace_id: ctx.workspace.id,
    name: clean,
    slug,
    accent_color: accentColor || "#8A94A3",
    sort_order: maxOrder + 1,
  });
  if (error) return { error: "Could not create the department. Try again." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function renameDepartment(
  ws: string,
  id: string,
  name: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage departments." };
  }
  const clean = name.trim();
  if (!clean) return { error: "The name cannot be empty." };

  // The slug stays fixed so handoff mapping and links keep working.
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ name: clean })
    .eq("id", id);
  if (error) return { error: "Could not rename the department." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function deleteDepartment(
  ws: string,
  id: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage departments." };
  }

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();
  if (dept?.is_default) {
    return { error: "Set another department as default before deleting this one." };
  }

  // Projects filed here become unfiled (department_id set null by the FK).
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: "Could not delete the department." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function setDefaultDepartment(
  ws: string,
  id: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage departments." };
  }

  const supabase = await createClient();
  await supabase
    .from("departments")
    .update({ is_default: false })
    .eq("workspace_id", ctx.workspace.id);
  const { error } = await supabase
    .from("departments")
    .update({ is_default: true })
    .eq("id", id);
  if (error) return { error: "Could not set the default department." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function addDepartmentMember(
  ws: string,
  departmentId: string,
  profileId: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage department members." };
  }
  if (!profileId) return { error: "Pick a person to add." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("department_members")
    .insert({ department_id: departmentId, profile_id: profileId });
  if (error) return { error: "Could not add the member." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function removeDepartmentMember(
  ws: string,
  departmentId: string,
  profileId: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage department members." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("department_members")
    .delete()
    .eq("department_id", departmentId)
    .eq("profile_id", profileId);
  if (error) return { error: "Could not remove the member." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

export async function createList(
  ws: string,
  departmentId: string,
  slug: string,
  name: string
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can add lists." };
  }
  const clean = name.trim();
  if (!clean) return { error: "Give the list a name." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("project_lists")
    .select("id", { count: "exact", head: true })
    .eq("department_id", departmentId);
  const { error } = await supabase.from("project_lists").insert({
    department_id: departmentId,
    name: clean,
    sort_order: count ?? 0,
  });
  if (error) return { error: "Could not add the list. Try again." };

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}

// Deleting a list unfiles its projects (list_id becomes null); the projects
// stay in the department.
export async function deleteList(
  ws: string,
  listId: string,
  slug: string
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can remove lists." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_lists").delete().eq("id", listId);
  if (error) return { error: "Could not remove the list. Try again." };

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}
