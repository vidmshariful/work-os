"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { LeaveType } from "@/lib/types";

// Leave actions. Routing, balance accounting, and notifications live in
// database triggers; these actions submit and decide under the user's RLS.

export interface LeaveActionState {
  error: string | null;
  success?: string | null;
}

const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "unpaid", "other"];

// Weekdays between two dates, inclusive. The server recomputes, never trusts
// the client's number.
function weekdaysBetween(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export async function createLeaveRequest(
  _prev: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);

  const type = String(formData.get("type") ?? "annual");
  const startRaw = String(formData.get("start_date") ?? "");
  const endRaw = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!LEAVE_TYPES.includes(type as LeaveType)) return { error: "Pick a leave type." };
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (!startRaw || Number.isNaN(start.getTime())) return { error: "Pick a start date." };
  if (!endRaw || Number.isNaN(end.getTime())) return { error: "Pick an end date." };
  if (end < start) return { error: "The end date cannot be before the start." };

  const days = weekdaysBetween(start, end);
  if (days <= 0) return { error: "The range contains no working days." };

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    workspace_id: ctx.workspace.id,
    profile_id: ctx.userId,
    type: type as LeaveType,
    start_date: startRaw,
    end_date: endRaw,
    days,
    reason: reason || null,
  });
  if (error) return { error: "The request could not be submitted." };

  revalidatePath(`/${ws}/hr`);
  return { error: null, success: "Request submitted. It routes up your reporting line." };
}

export async function cancelLeaveRequest(
  ws: string,
  requestId: string
): Promise<LeaveActionState> {
  await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);
  if (error) return { error: "Only pending requests can be cancelled." };

  revalidatePath(`/${ws}/hr`);
  return { error: null, success: "Request cancelled." };
}

// A lead endorses: the request stays pending and moves to the final gate.
export async function endorseLeave(
  ws: string,
  requestId: string
): Promise<LeaveActionState> {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ lead_approved_by: ctx.userId })
    .eq("id", requestId);
  if (error) return { error: "This request could not be endorsed." };

  revalidatePath(`/${ws}/hr`);
  return { error: null, success: "Endorsed. The Operations Manager has the final say." };
}

export async function decideLeave(
  ws: string,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<LeaveActionState> {
  await getWorkspaceContext(ws);
  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Pick a decision." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: note?.trim() || null })
    .eq("id", requestId);
  if (error) return { error: "The decision could not be recorded." };

  revalidatePath(`/${ws}/hr`);
  revalidatePath(`/${ws}/calendar`);
  return {
    error: null,
    success: decision === "approved" ? "Leave approved." : "Leave rejected.",
  };
}
