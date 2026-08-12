"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";
import type { ProjectStatus, ProjectTemplate } from "@/lib/types";
import type { ProjectFile } from "@/components/features/projects/types";

const BUCKET = "project-files";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface ProjectFormState {
  error: string | null;
}

export interface FileFormState {
  error: string | null;
  success: string | null;
  stamp: number;
}

// ---- create ----

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "You do not have permission to create projects." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the project a title." };

  const templateId = String(formData.get("template_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const type = String(formData.get("type") ?? "").trim();
  const ownerId = String(formData.get("owner_id") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  let departmentId = String(formData.get("department_id") ?? "");

  const supabase = await createClient();

  // Every project belongs to a department. When the caller does not pick one,
  // file it into the workspace's default department; an executive can move it.
  if (!departmentId) {
    const { data: def } = await supabase
      .from("departments")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_default", true)
      .maybeSingle();
    departmentId = def?.id ?? "";
  }

  // Load the template first so a bad choice fails before the code is burned.
  let template: ProjectTemplate | null = null;
  if (templateId) {
    const { data } = await supabase
      .from("project_templates")
      .select("*")
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle();
    if (!data) return { error: "That template is not available." };
    template = data as ProjectTemplate;
  }

  const { data: code, error: codeError } = await supabase.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "project",
  });
  if (codeError || !code) {
    return { error: "Could not generate a project code. Try again." };
  }

  const { data: project, error: insertError } = await supabase
    .from("projects")
    .insert({
      workspace_id: ctx.workspace.id,
      client_id: clientId || null,
      department_id: departmentId || null,
      list_id: listId || null,
      code: code as string,
      title,
      type: type || null,
      status: "backlog",
      owner_id: ownerId || ctx.userId,
      start_date: startDate || null,
      due_date: dueDate || null,
    })
    .select("id")
    .single();
  if (insertError || !project) {
    return { error: "Could not create the project. Try again." };
  }

  // Scaffold phases, tasks, and deliverables from the template structure.
  if (template) {
    const structure = template.structure ?? { phases: [] };
    const phases = structure.phases ?? [];

    if (phases.length > 0) {
      const { data: phaseRows } = await supabase
        .from("project_phases")
        .insert(
          phases.map((p, i) => ({
            project_id: project.id,
            name: p.name,
            sort_order: i,
          }))
        )
        .select("id, sort_order");

      const phaseIdBySort = new Map<number, string>(
        ((phaseRows ?? []) as { id: string; sort_order: number }[]).map((r) => [
          r.sort_order,
          r.id,
        ])
      );

      const taskRows = phases.flatMap((p, i) =>
        (p.tasks ?? []).map((t) => ({
          project_id: project.id,
          phase_id: phaseIdBySort.get(i) ?? null,
          title: t.title,
          description: t.description ?? null,
          status: "backlog" as const,
        }))
      );
      if (taskRows.length > 0) {
        await supabase.from("tasks").insert(taskRows);
      }
    }

    const deliverables = structure.deliverables ?? [];
    if (deliverables.length > 0) {
      await supabase.from("deliverables").insert(
        deliverables.map((title, i) => ({
          project_id: project.id,
          title,
          sort_order: i,
        }))
      );
    }

    // Field values the template stamps on. Checked against the live
    // definitions rather than trusted from the jsonb: a field deleted since
    // the template was written simply stops applying, and one scoped to a
    // different space is skipped rather than filed where it does not belong.
    const templateFields = (structure.fields ?? []).filter(
      (f) => f.field_id && f.value !== null && f.value !== undefined && f.value !== ""
    );
    if (templateFields.length > 0) {
      const { data: known } = await supabase
        .from("project_fields")
        .select("id, department_id")
        .eq("workspace_id", ctx.workspace.id)
        .in("id", templateFields.map((f) => f.field_id));
      const applies = new Map(
        ((known ?? []) as { id: string; department_id: string | null }[])
          .filter((f) => f.department_id === null || f.department_id === departmentId)
          .map((f) => [f.id, true])
      );
      const rows = templateFields
        .filter((f) => applies.has(f.field_id))
        .map((f) => ({ project_id: project.id, field_id: f.field_id, value: f.value }));
      if (rows.length > 0) await supabase.from("project_field_values").insert(rows);
    }
  }

  revalidatePath(`/${ws}/projects`);
  redirect(`/${ws}/projects/${project.id}`);
}

// The inline row at the bottom of a list section. One field, because
// anything else would make it slower than the modal it exists to avoid.
// Everything not asked for takes the same default the full form would give
// it: backlog, the creator as owner, no client, no dates, no template.
//
// listId null files it into the space with no list, which is what the
// Unlisted section's quick add means.
export async function quickAddProject(
  ws: string,
  slug: string,
  departmentId: string,
  listId: string | null,
  title: string
): Promise<{ error: string | null; code: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can create projects.", code: null };
  }
  const clean = title.trim();
  if (!clean) return { error: "Type a title first.", code: null };

  const supabase = await createClient();
  // A list belongs to one space, so the pairing is checked before a code is
  // burned rather than after.
  if (listId) {
    const { data: list } = await supabase
      .from("project_lists")
      .select("id, department_id")
      .eq("id", listId)
      .maybeSingle();
    if (!list) return { error: "That list no longer exists.", code: null };
    if (list.department_id !== departmentId) {
      return { error: "That list belongs to a different space.", code: null };
    }
  }

  const { data: code, error: codeError } = await supabase.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "project",
  });
  if (codeError || !code) {
    return { error: "Could not generate a project code. Try again.", code: null };
  }

  const { error } = await supabase.from("projects").insert({
    workspace_id: ctx.workspace.id,
    department_id: departmentId,
    list_id: listId,
    code: code as string,
    title: clean,
    status: "backlog",
    owner_id: ctx.userId,
  });
  if (error) return { error: "Could not create the project. Try again.", code: null };

  revalidatePath(`/${ws}/departments/${slug}`);
  return { error: null, code: code as string };
}

// ---- sub-projects ----
// A sub-project inherits its parent's space, list, and client, but has its own
// owner and tasks. One level deep, enforced by a database trigger too.

export async function createSubProject(
  ws: string,
  parentId: string,
  title: string,
  ownerId: string
): Promise<ProjectFormState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can add sub-projects." };
  }
  const clean = title.trim();
  if (!clean) return { error: "Give the sub-project a title." };

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("projects")
    .select("id, workspace_id, department_id, list_id, client_id, parent_project_id")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.workspace_id !== ctx.workspace.id) {
    return { error: "Parent project not found." };
  }
  if (parent.parent_project_id) {
    return { error: "Sub-projects are one level deep." };
  }

  const { data: code, error: codeError } = await supabase.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "project",
  });
  if (codeError || !code) return { error: "Could not generate a code. Try again." };

  const { error } = await supabase.from("projects").insert({
    workspace_id: ctx.workspace.id,
    department_id: parent.department_id,
    list_id: parent.list_id,
    client_id: parent.client_id,
    parent_project_id: parentId,
    code: code as string,
    title: clean,
    status: "backlog",
    owner_id: ownerId || ctx.userId,
  });
  if (error) return { error: "Could not create the sub-project. Try again." };

  revalidatePath(`/${ws}/projects/${parentId}`);
  return { error: null };
}

// ---- status and archive ----

// Priority, on the same 0 to 2 scale tasks use. Manager or owner, the same
// rule every other project write takes; RLS says the same thing.
export async function setProjectPriority(
  ws: string,
  projectId: string,
  priority: number
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!Number.isInteger(priority) || priority < 0 || priority > 2) {
    return { error: "That is not a priority." };
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ priority })
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error) return { error: "Could not set the priority. Try again." };
  if (!data || data.length === 0) {
    return { error: "Only managers or the project owner can set priority." };
  }

  revalidatePath(`/${ws}/projects/${projectId}`);
  revalidatePath(`/${ws}/departments`, "layout");
  return { error: null };
}

export async function updateProjectStatus(
  ws: string,
  projectId: string,
  status: ProjectStatus
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  const isOwner = project.owner_id === ctx.userId;
  if (!ctx.capabilities.canCreateProjects && !isOwner) {
    return { error: "Only managers or the project owner can change status." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId);
  if (error) return { error: "Could not update the status. Try again." };

  revalidatePath(`/${ws}/projects`);
  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

export async function archiveProject(
  ws: string,
  projectId: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can archive projects." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id);
  if (error) return { error: "Could not archive the project. Try again." };

  revalidatePath(`/${ws}/projects`);
  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// Bring an archived project back into the active list. Managers only, and it
// lands in backlog since the prior status is not tracked.
export async function restoreProject(
  ws: string,
  projectId: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can restore projects." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "backlog" })
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "archived");
  if (error) return { error: "Could not restore the project. Try again." };

  revalidatePath(`/${ws}/projects`);
  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// ---- header edits and brief ----
// Managers and the project owner may edit. RLS enforces the same, so these
// checks only produce a friendly message before Postgres would refuse.

async function assertCanEditProject(
  ws: string,
  projectId: string
): Promise<{ error: string } | null> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };
  const isOwner = project.owner_id === ctx.userId;
  if (!ctx.capabilities.canCreateProjects && !isOwner) {
    return { error: "Only managers or the project owner can edit this project." };
  }
  return null;
}

export interface ProjectPatch {
  title?: string;
  type?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  owner_id?: string | null;
  department_id?: string | null;
  list_id?: string | null;
}

export async function updateProject(
  ws: string,
  projectId: string,
  patch: ProjectPatch
): Promise<ProjectFormState> {
  const denied = await assertCanEditProject(ws, projectId);
  if (denied) return denied;

  const clean: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { error: "The title cannot be empty." };
    clean.title = title;
  }
  if (patch.type !== undefined) clean.type = patch.type?.trim() || null;
  if (patch.start_date !== undefined) clean.start_date = patch.start_date || null;
  if (patch.due_date !== undefined) clean.due_date = patch.due_date || null;
  if (patch.owner_id !== undefined) clean.owner_id = patch.owner_id || null;
  if (patch.department_id !== undefined) {
    clean.department_id = patch.department_id || null;
    // Moving departments clears the list, which belongs to the old one.
    clean.list_id = null;
  }
  if (patch.list_id !== undefined) clean.list_id = patch.list_id || null;
  if (Object.keys(clean).length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(clean).eq("id", projectId);
  if (error) return { error: "Could not save the project. Try again." };

  revalidatePath(`/${ws}/projects`);
  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

export async function setProjectBrief(
  ws: string,
  projectId: string,
  brief: string
): Promise<ProjectFormState> {
  const denied = await assertCanEditProject(ws, projectId);
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ brief: brief.trim() || null })
    .eq("id", projectId);
  if (error) return { error: "Could not save the brief. Try again." };

  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// ---- deliverables ----

export async function toggleDeliverable(
  ws: string,
  projectId: string,
  deliverableId: string,
  isDone: boolean
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and managers can check off deliverables." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("deliverables")
    .update({ is_done: isDone })
    .eq("id", deliverableId)
    .eq("project_id", projectId);
  if (error) return { error: "Could not update the deliverable. Try again." };

  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// ---- files ----
// The bucket is private, so reads and writes go through the admin client.
// Every entry point first loads the project through the USER client: if RLS
// returns nothing, the caller is not a member and is denied.

async function verifyProjectAccess(
  ws: string,
  projectId: string
): Promise<{ workspaceId: string } | null> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return null;
  return { workspaceId: ctx.workspace.id };
}

export async function uploadProjectFile(
  _prev: FileFormState,
  formData: FormData
): Promise<FileFormState> {
  const ws = String(formData.get("ws") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const stamp = Date.now();

  const access = await verifyProjectAccess(ws, projectId);
  if (!access) return { error: "Project not found.", success: null, stamp };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", success: null, stamp };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "Files can be up to 50 MB.", success: null, stamp };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${access.workspaceId}/${projectId}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) {
    return { error: "The upload failed. Try again.", success: null, stamp };
  }

  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null, success: "File uploaded.", stamp };
}

export async function listProjectFiles(
  ws: string,
  projectId: string
): Promise<ProjectFile[]> {
  const access = await verifyProjectAccess(ws, projectId);
  if (!access) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(`${access.workspaceId}/${projectId}`, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (error || !data) return [];

  return data
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({
      name: f.name.replace(/^\d{13}-/, ""),
      path: `${access.workspaceId}/${projectId}/${f.name}`,
      size:
        (f.metadata as { size?: number } | null)?.size ?? 0,
      createdAt: f.created_at ?? null,
    }));
}

export async function getFileUrl(
  ws: string,
  projectId: string,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const access = await verifyProjectAccess(ws, projectId);
  if (!access) return { url: null, error: "Project not found." };

  // The signed path must live inside this project's folder.
  if (!path.startsWith(`${access.workspaceId}/${projectId}/`)) {
    return { url: null, error: "File not found." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    return { url: null, error: "Could not prepare the download. Try again." };
  }
  return { url: data.signedUrl, error: null };
}

export async function deleteProjectFile(
  ws: string,
  projectId: string,
  path: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can delete files." };
  }

  const access = await verifyProjectAccess(ws, projectId);
  if (!access) return { error: "Project not found." };
  if (!path.startsWith(`${access.workspaceId}/${projectId}/`)) {
    return { error: "File not found." };
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) return { error: "Could not delete the file. Try again." };

  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// Inline owner change from the table view. Gated exactly like
// updateProjectStatus, because projects_update allows a manager or the
// current owner and nothing else. A non-manager owner handing the project to
// someone else is refused by the policy's CHECK, since they would no longer
// satisfy it, and that refusal surfaces as a clean message rather than a
// silent no-op.
export async function setProjectOwner(
  ws: string,
  projectId: string,
  ownerId: string | null
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  const isOwner = project.owner_id === ctx.userId;
  if (!ctx.capabilities.canCreateProjects && !isOwner) {
    return { error: "Only managers or the project owner can change the owner." };
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ owner_id: ownerId })
    .eq("id", projectId)
    .select("id");
  if (error) return { error: "Could not update the owner. Try again." };
  if (!data || data.length === 0) {
    return { error: "You cannot hand this project to someone else." };
  }

  revalidatePath(`/${ws}/projects`);
  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}

// Moving a project into a list, or out of every list when listId is null.
// Gated like every other project write: projects_update permits a manager or
// the current owner. The trigger writes the activity entry.
export async function setProjectList(
  ws: string,
  projectId: string,
  listId: string | null
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, department_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };
  if (!ctx.capabilities.canCreateProjects && project.owner_id !== ctx.userId) {
    return { error: "Only managers or the project owner can move this." };
  }

  // A list belongs to one space, so refuse a move that would file a project
  // into a list from somewhere else.
  if (listId) {
    const { data: list } = await supabase
      .from("project_lists")
      .select("id, department_id")
      .eq("id", listId)
      .maybeSingle();
    if (!list) return { error: "That list no longer exists." };
    if (list.department_id !== project.department_id) {
      return { error: "That list belongs to a different space." };
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ list_id: listId })
    .eq("id", projectId)
    .select("id");
  if (error) return { error: "Could not move the project. Try again." };
  if (!data || data.length === 0) return { error: "You cannot move this project." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Making a project a sub-project, or promoting it back with parentId null.
// The one-level rule is enforced by a database trigger; these checks exist so
// the person gets a reason instead of a raised exception.
export async function setProjectParent(
  ws: string,
  projectId: string,
  parentId: string | null
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, department_id, parent_project_id")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };
  if (!ctx.capabilities.canCreateProjects && project.owner_id !== ctx.userId) {
    return { error: "Only managers or the project owner can move this." };
  }

  if (parentId) {
    if (parentId === projectId) {
      return { error: "A project cannot be its own parent." };
    }
    const { data: parent } = await supabase
      .from("projects")
      .select("id, title, parent_project_id, department_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return { error: "That project no longer exists." };
    if (parent.parent_project_id) {
      return {
        error: "Sub-projects only go one level deep, and that one is already a sub-project.",
      };
    }
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("parent_project_id", projectId);
    if ((count ?? 0) > 0) {
      return {
        error: "This project has sub-projects of its own, so it cannot become one.",
      };
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ parent_project_id: parentId })
    .eq("id", projectId)
    .select("id");
  // The trigger is the real gate. If it fires anyway, say so plainly rather
  // than leaking the raised text.
  if (error) {
    return { error: "Sub-projects only go one level deep. That move is not allowed." };
  }
  if (!data || data.length === 0) return { error: "You cannot move this project." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Moving a project to another space. The clear-the-list rule lives in
// updateProject and is not repeated here: a list belongs to exactly one
// space, so leaving list_id behind would file the project into a list that
// is no longer reachable from it.
//
// Sub-projects come along. createSubProject files a child into its parent's
// space, so leaving children behind would split a parent from its own work
// across two spaces, where each half is visible to a different set of people.
export async function setProjectDepartment(
  ws: string,
  projectId: string,
  departmentId: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!dept) return { error: "That space is not available." };

  const moved = await updateProject(ws, projectId, { department_id: departmentId });
  if (moved.error) return { error: moved.error };

  const { data: children } = await supabase
    .from("projects")
    .select("id")
    .eq("parent_project_id", projectId);
  for (const child of (children ?? []) as { id: string }[]) {
    const res = await updateProject(ws, child.id, { department_id: departmentId });
    // A child owned by someone else is refused by projects_update. Say so
    // rather than reporting a clean move that left half the work behind.
    if (res.error) {
      return { error: "The project moved, but a sub-project could not follow it." };
    }
  }

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Setting or clearing a due date from the row menu. Thin on purpose: the
// permission check and the write both live in updateProject, and the trigger
// logs due_changed.
export async function setProjectDueDate(
  ws: string,
  projectId: string,
  dueDate: string | null
): Promise<{ error: string | null }> {
  const res = await updateProject(ws, projectId, { due_date: dueDate });
  if (res.error) return res;
  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// Copy a project's shape so a repeat engagement does not have to be rebuilt
// by hand. What comes across: the header fields, the phase structure, the
// task titles, and the deliverable checklist.
//
// What deliberately does not: progress of any kind. The copy starts in
// backlog with every task back in backlog and every deliverable unchecked,
// because a duplicate is work still to do, not work already done. Comments,
// files, and activity stay with the original, and sub-projects are not
// duplicated: cloning a tree from a menu item is more than the gesture
// promises.
export async function duplicateProject(
  ws: string,
  projectId: string
): Promise<{ error: string | null; id: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) {
    return { error: "Only managers can duplicate projects.", id: null };
  }

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!source) return { error: "Project not found.", id: null };

  const { data: code, error: codeError } = await supabase.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "project",
  });
  if (codeError || !code) {
    return { error: "Could not generate a project code. Try again.", id: null };
  }

  const { data: copy, error: insertError } = await supabase
    .from("projects")
    .insert({
      workspace_id: ctx.workspace.id,
      client_id: source.client_id,
      department_id: source.department_id,
      list_id: source.list_id,
      parent_project_id: source.parent_project_id,
      code: code as string,
      title: `${source.title} (copy)`,
      type: source.type,
      status: "backlog",
      owner_id: source.owner_id,
      start_date: source.start_date,
      due_date: source.due_date,
      brief: source.brief,
    })
    .select("id")
    .single();
  if (insertError || !copy) {
    return { error: "Could not duplicate the project. Try again.", id: null };
  }

  const [{ data: phases }, { data: deliverables }] = await Promise.all([
    supabase
      .from("project_phases")
      .select("id, name, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("deliverables")
      .select("title, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
  ]);

  // Tasks point at phases, so the phases have to exist first and the old id
  // has to map to the new one.
  const phaseIdMap = new Map<string, string>();
  if ((phases ?? []).length > 0) {
    const { data: newPhases } = await supabase
      .from("project_phases")
      .insert(
        (phases ?? []).map((p) => ({
          project_id: copy.id,
          name: p.name,
          sort_order: p.sort_order,
        }))
      )
      .select("id, sort_order");
    const bySort = new Map(
      ((newPhases ?? []) as { id: string; sort_order: number }[]).map((p) => [
        p.sort_order,
        p.id,
      ])
    );
    for (const p of phases ?? []) {
      const next = bySort.get(p.sort_order);
      if (next) phaseIdMap.set(p.id, next);
    }
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, description, phase_id")
    .eq("project_id", projectId);
  if ((tasks ?? []).length > 0) {
    await supabase.from("tasks").insert(
      (tasks ?? []).map((t) => ({
        project_id: copy.id,
        phase_id: t.phase_id ? phaseIdMap.get(t.phase_id) ?? null : null,
        title: t.title,
        description: t.description,
        status: "backlog" as const,
      }))
    );
  }

  if ((deliverables ?? []).length > 0) {
    await supabase.from("deliverables").insert(
      (deliverables ?? []).map((d) => ({
        project_id: copy.id,
        title: d.title,
        sort_order: d.sort_order,
      }))
    );
  }

  revalidatePath(`/${ws}`, "layout");
  return { error: null, id: copy.id };
}

// Permanent delete. projects_delete is executive only, and the check here
// mirrors it so a manager gets a sentence instead of a silent no-op.
//
// The foreign keys decide what goes with it: tasks, phases, deliverables,
// comments, the intake and the commercials row all cascade. Payments and
// sub-projects are set null instead, so a child is promoted to top level
// rather than deleted along with its parent. The caller is told this before
// it happens.
export async function deleteProject(
  ws: string,
  projectId: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canDeleteProjects) {
    return { error: "Only executives can delete projects." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error) return { error: "Could not delete the project. Try again." };
  if (!data || data.length === 0) return { error: "You cannot delete this project." };

  revalidatePath(`/${ws}`, "layout");
  return { error: null };
}

// ---- comments ----

// Anyone who can see the project may comment, which is the same rule
// task_comments uses. RLS is the real gate: the insert policy checks both the
// author and workspace membership, so a project the caller cannot see rejects
// the row rather than trusting anything decided here.
export async function addProjectComment(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const ws = String(formData.get("ws") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const ctx = await getWorkspaceContext(ws);
  if (!projectId) return { error: "Missing project." };
  if (!body) return { error: "Write a comment first." };

  const supabase = await createClient();
  const { error } = await supabase.from("project_comments").insert({
    project_id: projectId,
    author_id: ctx.userId,
    body,
  });

  if (error) return { error: "The comment could not be posted." };

  revalidatePath(`/${ws}/projects/${projectId}`);
  return { error: null };
}
