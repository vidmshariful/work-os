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

  // Two checks before the row exists, so the person hears it now rather
  // than as a rejection a day later. RLS scopes both reads to their own
  // requests, and the same facts get re-read by whoever approves.
  const [{ data: overlapping }, { data: balance }, { data: pendingAnnual }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("start_date, end_date")
        .eq("workspace_id", ctx.workspace.id)
        .eq("profile_id", ctx.userId)
        .in("status", ["pending", "approved"])
        .lte("start_date", endRaw)
        .gte("end_date", startRaw)
        .limit(1),
      supabase
        .from("leave_balances")
        .select("total_days, used_days")
        .eq("workspace_id", ctx.workspace.id)
        .eq("profile_id", ctx.userId)
        .eq("year", start.getFullYear())
        .maybeSingle(),
      supabase
        .from("leave_requests")
        .select("days")
        .eq("workspace_id", ctx.workspace.id)
        .eq("profile_id", ctx.userId)
        .eq("type", "annual")
        .eq("status", "pending"),
    ]);

  if ((overlapping ?? []).length > 0) {
    return {
      error:
        "Those dates overlap a request you already have. Cancel it first if the plan changed.",
    };
  }

  // Only annual spends the allowance, so only annual is capped by it.
  // Pending annual days count as committed: two requests that each fit the
  // balance should not be able to overdraw it together.
  if (type === "annual" && balance) {
    const committed = (pendingAnnual ?? []).reduce((sum, r) => sum + Number(r.days), 0);
    const remaining =
      Number(balance.total_days) - Number(balance.used_days) - committed;
    if (days > remaining) {
      return {
        error:
          remaining <= 0
            ? "No annual days left this year. Ask an executive about the allowance."
            : `Only ${remaining} annual day${remaining === 1 ? "" : "s"} left this year, and this asks for ${days}.`,
      };
    }
  }

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
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);
  if (error) {
    // An executive may cancel anything, including leave already approved, so
    // the sentence about pending would be wrong for them.
    return {
      error:
        ctx.membership.archetype === "executive"
          ? "That request could not be cancelled."
          : "Only pending requests can be cancelled.",
    };
  }

  revalidatePath(`/${ws}/hr`);
  revalidatePath(`/${ws}/calendar`);
  return { error: null, success: "Request cancelled." };
}

// An executive writing down leave that is already settled: somebody was out
// last Tuesday, or the time off was agreed in a meeting and never filed. The
// record is created approved, which spends the annual allowance, and it says
// who filed it so it is never mistaken for something the person submitted.
export async function createLeaveForTeammate(
  _prev: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") {
    return { error: "Only an admin can record leave for someone else." };
  }

  const profileId = String(formData.get("profile_id") ?? "");
  const type = String(formData.get("type") ?? "annual");
  const startRaw = String(formData.get("start_date") ?? "");
  const endRaw = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!profileId) return { error: "Pick who this leave is for." };
  if (profileId === ctx.userId) {
    return { error: "Use the form above to file your own leave." };
  }
  if (!LEAVE_TYPES.includes(type as LeaveType)) return { error: "Pick a leave type." };
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (!startRaw || Number.isNaN(start.getTime())) return { error: "Pick a start date." };
  if (!endRaw || Number.isNaN(end.getTime())) return { error: "Pick an end date." };
  if (end < start) return { error: "The end date cannot be before the start." };

  const days = weekdaysBetween(start, end);
  if (days <= 0) return { error: "The range contains no working days." };

  const supabase = await createClient();

  // They have to be in this workspace. RLS would let an executive write any
  // profile id, so the membership is checked here rather than assumed.
  const { data: member } = await supabase
    .from("memberships")
    .select("profile_id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (!member) return { error: "That person is not in this workspace." };

  // The same overlap check the person would get, so an admin cannot book
  // somebody into two places at once by accident.
  const { data: overlapping } = await supabase
    .from("leave_requests")
    .select("start_date")
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId)
    .in("status", ["pending", "approved"])
    .lte("start_date", endRaw)
    .gte("end_date", startRaw)
    .limit(1);
  if ((overlapping ?? []).length > 0) {
    return { error: "Those dates overlap leave this person already has." };
  }

  const { error } = await supabase.from("leave_requests").insert({
    workspace_id: ctx.workspace.id,
    profile_id: profileId,
    type: type as LeaveType,
    start_date: startRaw,
    end_date: endRaw,
    days,
    reason: reason || null,
    status: "approved",
    decided_by: ctx.userId,
    decided_at: new Date().toISOString(),
    filed_by: ctx.userId,
  });
  if (error) return { error: "The leave could not be recorded." };

  revalidatePath(`/${ws}/hr`);
  revalidatePath(`/${ws}/calendar`);
  return {
    error: null,
    success: `Recorded, ${days} day${days === 1 ? "" : "s"}. They have been notified.`,
  };
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
  // Shown to the requester in their list and in the notification, so a
  // rejection arrives with its reason instead of as a bare no.
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

// The yearly allowance, set by an executive. RLS enforces the same rule, so
// this check only buys the sentence.
export async function setLeaveAllowance(
  ws: string,
  profileId: string,
  year: number,
  totalDays: number
): Promise<LeaveActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") {
    return { error: "Only executives set allowances." };
  }
  if (!Number.isFinite(totalDays) || totalDays < 0 || totalDays > 365) {
    return { error: "Allowances run from 0 to 365 days." };
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { error: "That is not a year." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_balances")
    .upsert(
      {
        workspace_id: ctx.workspace.id,
        profile_id: profileId,
        year,
        total_days: totalDays,
      },
      { onConflict: "workspace_id,profile_id,year" }
    )
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "The allowance could not be saved." };
  }

  revalidatePath(`/${ws}/hr`);
  return { error: null, success: "Allowance saved." };
}
