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

// The whole of the space settings General tab, in one write. Executive only,
// which is what departments_update already says; this check exists to give a
// sentence instead of a silent no-op.
export interface DepartmentPatch {
  name?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  accent_color?: string;
}

export async function updateDepartment(
  ws: string,
  id: string,
  patch: DepartmentPatch
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage spaces." };
  }

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("id, slug")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };

  const clean: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { error: "The name cannot be empty." };
    clean.name = name;
  }

  if (patch.slug !== undefined) {
    const slug = slugify(patch.slug);
    if (!slug) return { error: "The address needs at least one letter or number." };
    if (slug !== dept.slug) {
      // The unique index on (workspace_id, slug) is the real gate. Checking
      // first turns a constraint violation into a sentence that says which
      // part of it is the problem.
      const { data: taken } = await supabase
        .from("departments")
        .select("id")
        .eq("workspace_id", ctx.workspace.id)
        .eq("slug", slug)
        .maybeSingle();
      if (taken) return { error: "Another space already uses that address." };
    }
    clean.slug = slug;
  }

  if (patch.description !== undefined) {
    const description = patch.description?.trim() ?? "";
    if (description.length > 280) {
      return { error: "Keep the description under 280 characters." };
    }
    clean.description = description || null;
  }

  if (patch.icon !== undefined) {
    const icon = patch.icon?.trim() ?? "";
    // The column caps this too. Anything longer is a paste, not an icon.
    if (icon.length > 8) return { error: "An icon is one character or emoji." };
    clean.icon = icon || null;
  }

  if (patch.accent_color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(patch.accent_color)) {
      return { error: "That is not a colour this app can use." };
    }
    clean.accent_color = patch.accent_color.toUpperCase();
  }

  if (Object.keys(clean).length === 0) return { error: null };

  const { data, error } = await supabase
    .from("departments")
    .update(clean)
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not save the space. Try again." };
  if (!data || data.length === 0) return { error: "You cannot change this space." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Archiving takes a space out of the index and the sidebar without touching
// who can see it or what is inside it. The default space cannot be archived,
// for the same reason it cannot be deleted: createProject files work into it
// when nobody picks a space, so it has to stay in front of people. Postgres
// holds that rule too, in departments_default_not_archived_check.
export async function setDepartmentArchived(
  ws: string,
  id: string,
  archived: boolean
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage spaces." };
  }

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("id, is_default")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };
  if (archived && dept.is_default) {
    return { error: "Set another space as default before archiving this one." };
  }

  const { data, error } = await supabase
    .from("departments")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not change the space. Try again." };
  if (!data || data.length === 0) return { error: "You cannot change this space." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Deleting takes the name back as proof the confirmation was read. The check
// is here rather than only in the dialog, so calling the action directly
// still has to name the thing it is about to remove.
//
// What goes and what stays is decided by the foreign keys, and both halves
// are worth stating: projects are unfiled, keeping their tasks and their
// history, while the space's lists are deleted outright, because a list
// belongs to exactly one space and has nowhere to go.
export async function deleteDepartment(
  ws: string,
  id: string,
  confirmName: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage spaces." };
  }

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("name, is_default")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };
  if (dept.is_default) {
    return { error: "Set another space as default before deleting this one." };
  }
  if (confirmName.trim() !== dept.name) {
    return { error: "Type the space name exactly to confirm." };
  }

  const { data, error } = await supabase
    .from("departments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: "Could not delete the space." };
  if (!data || data.length === 0) return { error: "You cannot delete this space." };

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

// Membership in a space is what app_can_see_department() reads, so adding
// someone here is the act that makes a space and its projects exist for them.
// That is why this is executive only, in the policy and again here.
export async function addDepartmentMember(
  ws: string,
  departmentId: string,
  profileId: string
): Promise<DeptActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage space members." };
  }
  if (!profileId) return { error: "Pick a person to add." };

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };

  // Only people who are actually in this workspace, and still active. An id
  // from somewhere else would otherwise be handed visibility here.
  const { data: member } = await supabase
    .from("memberships")
    .select("profile_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (!member) return { error: "That person is not an active member of this workspace." };

  const { error } = await supabase
    .from("department_members")
    .upsert(
      { department_id: departmentId, profile_id: profileId },
      { onConflict: "department_id,profile_id", ignoreDuplicates: true }
    );
  if (error) return { error: "Could not add the member." };

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Returns how many non-executive members are left, because that is the
// number that decides whether anyone below executive can still see the
// space. Executives are counted out of it: they see every space through
// app_can_see_department's first branch whether or not a row exists here, so
// counting them would report a space as staffed when nobody works in it.
export async function removeDepartmentMember(
  ws: string,
  departmentId: string,
  profileId: string
): Promise<DeptActionState & { remaining: number }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { error: "Only executives can manage space members.", remaining: -1 };
  }

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available.", remaining: -1 };

  const { error } = await supabase
    .from("department_members")
    .delete()
    .eq("department_id", departmentId)
    .eq("profile_id", profileId);
  if (error) return { error: "Could not remove the member.", remaining: -1 };

  const { data: left } = await supabase
    .from("department_members")
    .select("profile_id")
    .eq("department_id", departmentId);
  const ids = ((left ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
  let remaining = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from("memberships")
      .select("profile_id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .in("profile_id", ids)
      .neq("archetype", "executive");
    remaining = count ?? 0;
  }

  revalidatePath(`/${ws}/admin/departments`);
  revalidatePath(`/${ws}`, "layout");
  return { error: null, remaining };
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

// Persist a new section order. project_lists_update is gated by
// app_can_assign, so leads and up may reorder, which is a wider set than the
// manager-or-owner rule that governs moving projects themselves.
export async function reorderLists(
  ws: string,
  slug: string,
  orderedIds: string[]
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can reorder lists." };
  }
  if (orderedIds.length === 0) return { error: null };

  const supabase = await createClient();
  // Confirm every id belongs to this space before writing any of them, so a
  // tampered payload cannot reorder another space's lists.
  const { data: owned } = await supabase
    .from("project_lists")
    .select("id, department_id, departments!inner(slug)")
    .in("id", orderedIds);
  const rows = (owned ?? []) as unknown as {
    id: string;
    departments: { slug: string };
  }[];
  if (rows.length !== orderedIds.length || rows.some((r) => r.departments.slug !== slug)) {
    return { error: "Those lists are not all in this space." };
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("project_lists")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { error: "Could not save the new order. Try again." };
  }

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}

// The seven palette keys the design system draws with. Postgres holds the
// same set in project_lists_color_check, so this is a friendly error rather
// than the real gate.
const LIST_COLORS = ["blue", "violet", "green", "amber", "rose", "teal", "gray"];

// Confirms a list exists and sits in the space the caller says it does, so a
// tampered id cannot reach into another space's lists.
async function listInSpace(
  slug: string,
  listId: string
): Promise<{ id: string; department_id: string; name: string; color: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_lists")
    .select("id, department_id, name, color, departments!inner(slug)")
    .eq("id", listId)
    .maybeSingle();
  const row = data as unknown as
    | { id: string; department_id: string; name: string; color: string | null; departments: { slug: string } }
    | null;
  if (!row || row.departments.slug !== slug) return null;
  return { id: row.id, department_id: row.department_id, name: row.name, color: row.color };
}

export async function renameList(
  ws: string,
  slug: string,
  listId: string,
  name: string
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can rename lists." };
  }
  const clean = name.trim();
  if (!clean) return { error: "The list name cannot be empty." };
  if (!(await listInSpace(slug, listId))) return { error: "That list is not in this space." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_lists")
    .update({ name: clean })
    .eq("id", listId)
    .select("id");
  if (error) return { error: "Could not rename the list. Try again." };
  if (!data || data.length === 0) return { error: "You cannot rename this list." };

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}

export async function setListColor(
  ws: string,
  slug: string,
  listId: string,
  color: string | null
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can change list colours." };
  }
  if (color !== null && !LIST_COLORS.includes(color)) {
    return { error: "That is not one of the available colours." };
  }
  if (!(await listInSpace(slug, listId))) return { error: "That list is not in this space." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_lists")
    .update({ color })
    .eq("id", listId)
    .select("id");
  if (error) return { error: "Could not change the colour. Try again." };
  if (!data || data.length === 0) return { error: "You cannot change this list." };

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}

// Moving a list to another space has to take its projects with it. A list
// belongs to exactly one space, so a project left behind would be filed in
// space A through a list that now lives in space B, and setProjectList
// already refuses that pairing.
//
// Two gates apply, and only one of them is here.
//
// The capability gate is canCreateProjects rather than the canAssignTasks
// that governs every other list edit, because this rewrites rows in
// projects. projects_update is manager-or-owner, so a lead would move the
// list and then be refused on the projects, leaving exactly the split this is
// meant to prevent.
//
// The real gate is Postgres, and it is stricter: the destination has to be a
// space you can see. Postgres applies projects_select to the updated row, so
// a manager who is not a member of the destination is refused even though
// projects_update says manager-or-owner. Verified on the live database: the
// same write is refused, accepted once a department_members row exists, and
// refused again when it is removed. The menu only ever offers spaces that
// came back through departments_select, so this is a backstop rather than
// something a person should be able to walk into.
export async function moveListToSpace(
  ws: string,
  slug: string,
  listId: string,
  departmentId: string
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return {
      error: "Only managers can move a list to another space, because its projects move too.",
    };
  }
  const list = await listInSpace(slug, listId);
  if (!list) return { error: "That list is not in this space." };
  if (list.department_id === departmentId) return { error: null };

  const supabase = await createClient();
  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };

  // Projects first, so a refusal leaves the list where it is rather than
  // stranding it in a space its work is not in. There is no transaction
  // across these writes, so a failure partway is reported as the partial
  // state it is rather than as a clean rollback that did not happen.
  const { data: filed } = await supabase
    .from("projects")
    .select("id")
    .eq("list_id", listId);
  const ids = ((filed ?? []) as { id: string }[]).map((p) => p.id);
  let movedCount = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("projects")
      .update({ department_id: departmentId })
      .eq("id", id);
    if (error) {
      return {
        error:
          movedCount === 0
            ? "The projects in this list could not be moved, so the list stayed put."
            : `Only ${movedCount} of ${ids.length} projects moved, so the list stayed put. Reload and check.`,
      };
    }
    movedCount++;
  }

  const { error } = await supabase
    .from("project_lists")
    .update({ department_id: departmentId })
    .eq("id", listId);
  if (error) {
    return { error: "The projects moved, but the list did not. Reload and check." };
  }

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Copy a list, optionally with the work in it. Without projects this is just
// another empty bucket, so leads may do it. With projects it inserts rows
// into projects, which projects_insert reserves for managers.
//
// Copied projects start in backlog with no dates and no tasks: this
// duplicates the shape of a list, not the state of the work inside it. Use
// Duplicate on a project when a full copy is what you want.
export async function duplicateList(
  ws: string,
  slug: string,
  listId: string,
  withProjects: boolean
): Promise<ListActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can duplicate lists." };
  }
  if (withProjects && !ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can copy the projects along with the list." };
  }
  const list = await listInSpace(slug, listId);
  if (!list) return { error: "That list is not in this space." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("project_lists")
    .select("id", { count: "exact", head: true })
    .eq("department_id", list.department_id);

  const { data: copy, error } = await supabase
    .from("project_lists")
    .insert({
      department_id: list.department_id,
      name: `${list.name} (copy)`,
      color: list.color,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !copy) return { error: "Could not duplicate the list. Try again." };

  if (withProjects) {
    const { data: filed } = await supabase
      .from("projects")
      .select("id, title, type, client_id, owner_id, brief")
      .eq("list_id", listId)
      .is("parent_project_id", null);
    for (const p of (filed ?? []) as {
      title: string;
      type: string | null;
      client_id: string | null;
      owner_id: string | null;
      brief: string | null;
    }[]) {
      const { data: code } = await supabase.rpc("next_code", {
        ws: ctx.workspace.id,
        kind: "project",
      });
      if (!code) return { error: "Ran out of project codes partway through. Check the copy." };
      const { error: insertError } = await supabase.from("projects").insert({
        workspace_id: ctx.workspace.id,
        department_id: list.department_id,
        list_id: copy.id,
        client_id: p.client_id,
        code: code as string,
        title: p.title,
        type: p.type,
        status: "backlog",
        owner_id: p.owner_id,
        brief: p.brief,
      });
      if (insertError) {
        return { error: "The list was copied, but not every project came with it." };
      }
    }
  }

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null };
}

// Deleting a list unfiles its projects (list_id becomes null); the projects
// stay in the department.
// The count comes back so the confirmation the caller showed can be checked
// against what actually happened, rather than trusted.
export async function deleteList(
  ws: string,
  listId: string,
  slug: string
): Promise<{ error: string | null; moved: number }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can remove lists.", moved: 0 };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId);

  const { data, error } = await supabase
    .from("project_lists")
    .delete()
    .eq("id", listId)
    .select("id");
  if (error) return { error: "Could not remove the list. Try again.", moved: 0 };
  if (!data || data.length === 0) {
    return { error: "You cannot remove this list.", moved: 0 };
  }

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null, moved: count ?? 0 };
}
