"use server";

// Manual calendar events only. Project deadlines and approved leave are
// never written here, the calendar joins to them live.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";

export interface EventFormState {
  error: string | null;
}

const EVENT_TYPES = new Set(["shoot", "meeting", "holiday", "other"]);

export async function createEvent(
  _prev: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const ws = String(formData.get("ws") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "other").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!ws) return { error: "Something went wrong. Reload and try again." };

  // Friendly gate. RLS on the events table is the real one.
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateEvents) {
    return { error: "You do not have permission to create events." };
  }

  if (!title) return { error: "Give the event a title." };
  if (!EVENT_TYPES.has(type)) return { error: "Pick a valid event type." };
  if (!startDate) return { error: "Pick a start date." };
  if (endDate && endDate < startDate) {
    return { error: "The end date cannot be before the start date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    workspace_id: ctx.workspace.id,
    title,
    type,
    start_date: startDate,
    end_date: endDate || null,
    description: description || null,
    created_by: ctx.userId,
  });

  if (error) {
    return { error: "Could not create the event. Try again." };
  }

  revalidatePath(`/${ws}/calendar`);
  redirect(`/${ws}/calendar`);
}

// Creator or executive can delete a manual event. Used as a plain form
// action from the agenda list.
export async function deleteEvent(formData: FormData): Promise<void> {
  const ws = String(formData.get("ws") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!ws || !id) return;

  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, workspace_id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!event || event.workspace_id !== ctx.workspace.id) return;

  const isCreator = event.created_by === ctx.userId;
  const isExec = ctx.membership.archetype === "executive";
  if (!isCreator && !isExec) return;

  // RLS enforces the same rule underneath.
  await supabase.from("events").delete().eq("id", id);
  revalidatePath(`/${ws}/calendar`);
}
