"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { TaskStatus } from "@/lib/types";

// Server actions for the tasks area. RLS is the real gate on every write.
// The capability checks here only produce friendly errors before Postgres
// would refuse anyway. Assignment and revision notifications are created by
// database triggers, never from here.

export interface TaskActionState {
  error: string | null;
}

const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
];

const PRIORITIES = [0, 1, 2];

function revalidateTaskPaths(ws: string, taskId?: string) {
  revalidatePath(`/${ws}/tasks`);
  revalidatePath(`/${ws}/home`);
  if (taskId) revalidatePath(`/${ws}/tasks/${taskId}`);
}

// ---- create ----

export async function createTask(
  _prev: TaskActionState,
  formData: FormData
): Promise<TaskActionState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can create tasks." };
  }

  const projectId = String(formData.get("project_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId) return { error: "Pick a project." };
  if (!title) return { error: "Give the task a title." };

  const phaseId = String(formData.get("phase_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const assigneeId = String(formData.get("assignee_id") ?? "");
  const priorityRaw = Number(formData.get("priority") ?? 0);
  const dueDate = String(formData.get("due_date") ?? "");

  const supabase = await createClient();

  // The project must belong to this workspace.
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", projectId)
    .single();
  if (!project || project.workspace_id !== ctx.workspace.id) {
    return { error: "That project is not in this workspace." };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      phase_id: phaseId || null,
      title,
      description: description || null,
      assignee_id: assigneeId || null,
      status: "todo",
      priority: PRIORITIES.includes(priorityRaw) ? priorityRaw : 0,
      due_date: dueDate || null,
    })
    .select("id")
    .single();

  if (error || !task) {
    return { error: "The task could not be created. Check your access and try again." };
  }

  revalidateTaskPaths(ws);
  redirect(`/${ws}/tasks/${task.id}`);
}

// ---- status ----

export async function updateTaskStatus(
  ws: string,
  taskId: string,
  status: TaskStatus
): Promise<TaskActionState> {
  await getWorkspaceContext(ws);
  if (!TASK_STATUSES.includes(status)) {
    return { error: "That is not a valid status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId);

  if (error) {
    return { error: "The status could not be changed." };
  }

  revalidateTaskPaths(ws, taskId);
  return { error: null };
}

// ---- lead-only field updates ----

export interface TaskPatch {
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: number;
  due_date?: string | null;
  phase_id?: string | null;
}

export async function updateTask(
  ws: string,
  taskId: string,
  patch: TaskPatch
): Promise<TaskActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can edit task details." };
  }

  const clean: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { error: "The title cannot be empty." };
    clean.title = title;
  }
  if (patch.description !== undefined) {
    clean.description = patch.description?.trim() || null;
  }
  if (patch.assignee_id !== undefined) clean.assignee_id = patch.assignee_id;
  if (patch.priority !== undefined) {
    clean.priority = PRIORITIES.includes(patch.priority) ? patch.priority : 0;
  }
  if (patch.due_date !== undefined) clean.due_date = patch.due_date || null;
  if (patch.phase_id !== undefined) clean.phase_id = patch.phase_id;
  if (Object.keys(clean).length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(clean).eq("id", taskId);

  if (error) {
    return { error: "The task could not be updated." };
  }

  revalidateTaskPaths(ws, taskId);
  return { error: null };
}

// ---- description (assignee or lead) ----
// No capability gate here on purpose. RLS lets a person update their own
// task, and the guard trigger limits a contributor to status and
// description. Leads and up pass both. So this one write serves everyone
// who is legitimately allowed to edit the description.

export async function setTaskDescription(
  ws: string,
  taskId: string,
  description: string
): Promise<TaskActionState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ description: description.trim() || null })
    .eq("id", taskId);

  if (error) {
    return { error: "The description could not be saved." };
  }

  revalidateTaskPaths(ws, taskId);
  return { error: null };
}

// ---- subtasks (leads and up) ----
// A subtask inherits its parent's project and starts in todo. The one-level
// cap is enforced by a database trigger; we also check here for a clean error.

export async function createSubtask(
  ws: string,
  parentTaskId: string,
  title: string
): Promise<TaskActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can add subtasks." };
  }
  const clean = title.trim();
  if (!clean) return { error: "Give the subtask a title." };

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("tasks")
    .select("id, project_id, parent_task_id")
    .eq("id", parentTaskId)
    .maybeSingle();
  if (!parent) return { error: "Parent task not found." };
  if (parent.parent_task_id) {
    return { error: "Subtasks are one level deep." };
  }

  const { error } = await supabase.from("tasks").insert({
    project_id: parent.project_id,
    parent_task_id: parentTaskId,
    title: clean,
    status: "todo",
  });
  if (error) {
    return { error: "The subtask could not be added." };
  }

  revalidateTaskPaths(ws, parentTaskId);
  return { error: null };
}

// ---- delete (leads and up) ----

export async function deleteTask(
  ws: string,
  taskId: string
): Promise<TaskActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can delete tasks." };
  }

  const supabase = await createClient();
  // Dependencies, comments, and revisions cascade at the database level.
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) {
    return { error: "The task could not be deleted." };
  }

  revalidateTaskPaths(ws, taskId);
  return { error: null };
}

// ---- comments ----

export async function addComment(
  _prev: TaskActionState,
  formData: FormData
): Promise<TaskActionState> {
  const ws = String(formData.get("ws") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const ctx = await getWorkspaceContext(ws);
  if (!taskId) return { error: "Missing task." };
  if (!body) return { error: "Write a comment first." };

  const supabase = await createClient();
  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_id: ctx.userId,
    body,
  });

  if (error) {
    return { error: "The comment could not be posted." };
  }

  revalidatePath(`/${ws}/tasks/${taskId}`);
  return { error: null };
}

// ---- revisions ----

export async function logRevision(
  _prev: TaskActionState,
  formData: FormData
): Promise<TaskActionState> {
  const ws = String(formData.get("ws") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const ctx = await getWorkspaceContext(ws);
  if (!taskId) return { error: "Missing task." };
  if (!note) return { error: "Describe what needs revising." };

  // The database trigger bumps revision_count and notifies the assignee.
  const supabase = await createClient();
  const { error } = await supabase.from("task_revisions").insert({
    task_id: taskId,
    requested_by: ctx.userId,
    note,
  });

  if (error) {
    return { error: "The revision could not be logged." };
  }

  revalidateTaskPaths(ws, taskId);
  return { error: null };
}

// ---- dependencies ----

export async function addDependency(
  ws: string,
  taskId: string,
  dependsOnTaskId: string
): Promise<TaskActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can manage dependencies." };
  }
  if (!dependsOnTaskId || dependsOnTaskId === taskId) {
    return { error: "A task cannot depend on itself." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("task_dependencies").insert({
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
  });

  if (error) {
    return { error: "The dependency could not be added." };
  }

  revalidatePath(`/${ws}/tasks/${taskId}`);
  return { error: null };
}

export async function removeDependency(
  ws: string,
  taskId: string,
  dependsOnTaskId: string
): Promise<TaskActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) {
    return { error: "Only leads and up can manage dependencies." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);

  if (error) {
    return { error: "The dependency could not be removed." };
  }

  revalidatePath(`/${ws}/tasks/${taskId}`);
  return { error: null };
}

// ---- lookups for client components ----

export async function getPhasesForProject(
  ws: string,
  projectId: string
): Promise<{ id: string; name: string }[]> {
  await getWorkspaceContext(ws);
  if (!projectId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_phases")
    .select("id, name")
    .eq("project_id", projectId)
    .order("sort_order");

  return (data ?? []) as { id: string; name: string }[];
}
