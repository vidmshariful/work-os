"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { TodoLabel } from "@/lib/types";

// Personal to-dos and their stages, labels, and checklists for My Zone. Every
// row is owner-only at the database level, so these actions confirm workspace
// membership and let RLS do the gating.

export interface TodoState {
  error: string | null;
}

const PRIORITIES = [0, 1, 2];

function ok() {
  return { error: null };
}

// ---- to-dos ----

export async function createTodo(
  _prev: TodoState,
  formData: FormData
): Promise<TodoState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  const title = String(formData.get("title") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  let stageId = String(formData.get("stage_id") ?? "");
  const priority = Number(formData.get("priority") ?? 0);
  if (!title) return { error: "Write something to add." };

  const supabase = await createClient();
  // No column chosen means the default landing stage (Backlog).
  if (!stageId) {
    const { data: def } = await supabase
      .from("todo_stages")
      .select("id")
      .eq("profile_id", ctx.userId)
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    stageId = def?.id ?? "";
  }
  const { error } = await supabase.from("personal_todos").insert({
    profile_id: ctx.userId,
    workspace_id: ctx.workspace.id,
    title,
    due_date: dueDate || null,
    stage_id: stageId || null,
    priority: PRIORITIES.includes(priority) ? priority : 0,
  });
  if (error) return { error: "Could not add the to-do. Try again." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export interface TodoPatch {
  title?: string;
  notes?: string | null;
  priority?: number;
  due_date?: string | null;
  stage_id?: string | null;
}

export async function updateTodo(
  ws: string,
  id: string,
  patch: TodoPatch
): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const clean: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { error: "The title cannot be empty." };
    clean.title = title;
  }
  if (patch.notes !== undefined) clean.notes = patch.notes?.trim() || null;
  if (patch.priority !== undefined) {
    clean.priority = PRIORITIES.includes(patch.priority) ? patch.priority : 0;
  }
  if (patch.due_date !== undefined) clean.due_date = patch.due_date || null;

  const supabase = await createClient();
  if (patch.stage_id !== undefined) {
    clean.stage_id = patch.stage_id || null;
    // Moving into the done column completes the to-do, and out of it reopens.
    if (patch.stage_id) {
      const { data: st } = await supabase
        .from("todo_stages")
        .select("is_done")
        .eq("id", patch.stage_id)
        .maybeSingle();
      clean.is_done = st?.is_done ?? false;
    }
  }
  if (Object.keys(clean).length === 0) return ok();

  const { error } = await supabase.from("personal_todos").update(clean).eq("id", id);
  if (error) return { error: "Could not save the to-do." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function toggleTodo(
  ws: string,
  id: string,
  isDone: boolean
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // Checking a to-do moves it to the done column; unchecking sends it back to
  // the default column. If no such column exists, just flip the flag.
  const { data: stage } = await supabase
    .from("todo_stages")
    .select("id")
    .eq("profile_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id)
    .eq(isDone ? "is_done" : "is_default", true)
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = { is_done: isDone };
  if (stage?.id) patch.stage_id = stage.id;
  const { error } = await supabase.from("personal_todos").update(patch).eq("id", id);
  if (error) return { error: "Could not update the to-do." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function deleteTodo(ws: string, id: string): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("personal_todos").delete().eq("id", id);
  if (error) return { error: "Could not delete the to-do." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

// ---- stages (kanban columns) ----

export async function createStage(
  ws: string,
  name: string,
  color: string
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "Give the stage a name." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("todo_stages")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id);
  const { error } = await supabase.from("todo_stages").insert({
    profile_id: ctx.userId,
    workspace_id: ctx.workspace.id,
    name: clean,
    color: color || "#8A94A3",
    sort_order: count ?? 0,
  });
  if (error) return { error: "Could not add the stage." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function renameStage(
  ws: string,
  id: string,
  name: string,
  color: string
): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "The name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("todo_stages")
    .update({ name: clean, color: color || "#8A94A3" })
    .eq("id", id);
  if (error) return { error: "Could not save the stage." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function deleteStage(ws: string, id: string): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // Move this stage's to-dos to a fallback (the default column, else the
  // first remaining) so nothing is left stranded.
  const { data: fallback } = await supabase
    .from("todo_stages")
    .select("id")
    .eq("profile_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id)
    .neq("id", id)
    .order("is_default", { ascending: false })
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  await supabase
    .from("personal_todos")
    .update({ stage_id: fallback?.id ?? null })
    .eq("stage_id", id);

  const { error } = await supabase.from("todo_stages").delete().eq("id", id);
  if (error) return { error: "Could not delete the stage." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function reorderStage(
  ws: string,
  id: string,
  direction: "up" | "down"
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("todo_stages")
    .select("id, sort_order")
    .eq("profile_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id)
    .order("sort_order");
  const list = (stages ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((s) => s.id === id);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return ok();

  const a = list[idx];
  const b = list[swap];
  await supabase.from("todo_stages").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("todo_stages").update({ sort_order: a.sort_order }).eq("id", b.id);

  revalidatePath(`/${ws}/todos`);
  return ok();
}

async function setStageFlag(
  ws: string,
  id: string,
  column: "is_default" | "is_done"
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  await supabase
    .from("todo_stages")
    .update({ [column]: false })
    .eq("profile_id", ctx.userId)
    .eq("workspace_id", ctx.workspace.id);
  const { error } = await supabase
    .from("todo_stages")
    .update({ [column]: true })
    .eq("id", id);
  if (error) return { error: "Could not update the stage." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function setDefaultStage(ws: string, id: string) {
  return setStageFlag(ws, id, "is_default");
}
export async function setDoneStage(ws: string, id: string) {
  return setStageFlag(ws, id, "is_done");
}

// ---- labels ----

export async function createLabel(
  ws: string,
  name: string,
  color: string
): Promise<{ error: string | null; label: TodoLabel | null }> {
  const ctx = await getWorkspaceContext(ws);
  const clean = name.trim();
  if (!clean) return { error: "Give the label a name.", label: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todo_labels")
    .insert({
      profile_id: ctx.userId,
      workspace_id: ctx.workspace.id,
      name: clean,
      color: color || "#3B6FF6",
    })
    .select("*")
    .single();
  if (error || !data) return { error: "Could not create the label.", label: null };

  revalidatePath(`/${ws}/todos`);
  return { error: null, label: data as TodoLabel };
}

export async function deleteLabel(ws: string, id: string): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("todo_labels").delete().eq("id", id);
  if (error) return { error: "Could not delete the label." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function setTodoLabel(
  ws: string,
  todoId: string,
  labelId: string,
  on: boolean
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  if (on) {
    const { error } = await supabase
      .from("todo_label_links")
      .insert({ todo_id: todoId, label_id: labelId, profile_id: ctx.userId });
    if (error) return { error: "Could not add the label." };
  } else {
    const { error } = await supabase
      .from("todo_label_links")
      .delete()
      .eq("todo_id", todoId)
      .eq("label_id", labelId);
    if (error) return { error: "Could not remove the label." };
  }

  revalidatePath(`/${ws}/todos`);
  return ok();
}

// ---- checklist ----

export async function addChecklistItem(
  ws: string,
  todoId: string,
  title: string
): Promise<TodoState> {
  const ctx = await getWorkspaceContext(ws);
  const clean = title.trim();
  if (!clean) return { error: "Write a step first." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("todo_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("todo_id", todoId);
  const { error } = await supabase.from("todo_checklist_items").insert({
    todo_id: todoId,
    profile_id: ctx.userId,
    title: clean,
    sort_order: count ?? 0,
  });
  if (error) return { error: "Could not add the step." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function toggleChecklistItem(
  ws: string,
  itemId: string,
  isDone: boolean
): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("todo_checklist_items")
    .update({ is_done: isDone })
    .eq("id", itemId);
  if (error) return { error: "Could not update the step." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}

export async function deleteChecklistItem(
  ws: string,
  itemId: string
): Promise<TodoState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase.from("todo_checklist_items").delete().eq("id", itemId);
  if (error) return { error: "Could not delete the step." };

  revalidatePath(`/${ws}/todos`);
  return ok();
}
