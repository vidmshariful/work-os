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

  const supabase = await createClient();

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
  }

  revalidatePath(`/${ws}/projects`);
  redirect(`/${ws}/projects/${project.id}`);
}

// ---- status and archive ----

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
