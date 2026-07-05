"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";

// Per-project intake and commercials. Both write under the USER client:
// project_intakes is gated to above-wall members, project_commercials to
// executives and the project's assigned manager. RLS is the gate; these
// actions only shape input and produce friendly errors.

export interface IntakeActionState {
  error: string | null;
  success?: string | null;
}

function cleanUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function refresh(ws: string, projectId: string, clientId?: string | null) {
  revalidatePath(`/${ws}/projects/${projectId}`);
  if (clientId) revalidatePath(`/${ws}/clients/${clientId}`);
}

export async function markProjectIntakeSent(
  ws: string,
  projectId: string,
  clientId: string | null,
  formUrl: string
): Promise<IntakeActionState> {
  await getWorkspaceContext(ws);
  if (!formUrl.trim()) return { error: "Paste the intake form link first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_intakes")
    .update({ status: "sent", form_url: cleanUrl(formUrl) })
    .eq("project_id", projectId);
  if (error) return { error: "Could not update the intake." };

  refresh(ws, projectId, clientId);
  return { error: null, success: "Intake marked sent." };
}

export async function markProjectIntakeReceived(
  _prev: IntakeActionState,
  formData: FormData
): Promise<IntakeActionState> {
  const ws = String(formData.get("ws") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "") || null;
  const ctx = await getWorkspaceContext(ws);

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_intakes")
    .update({
      status: "received",
      response_url: cleanUrl(String(formData.get("response_url") ?? "")),
      response_note: String(formData.get("response_note") ?? "").trim() || null,
      updated_by: ctx.userId,
    })
    .eq("project_id", projectId);
  if (error) return { error: "Could not save the intake response." };

  refresh(ws, projectId, clientId);
  return { error: null, success: "Intake received. The owner has been notified." };
}

export async function updateIntakeResponse(
  _prev: IntakeActionState,
  formData: FormData
): Promise<IntakeActionState> {
  const ws = String(formData.get("ws") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "") || null;
  const ctx = await getWorkspaceContext(ws);

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_intakes")
    .update({
      response_url: cleanUrl(String(formData.get("response_url") ?? "")),
      response_note: String(formData.get("response_note") ?? "").trim() || null,
      updated_by: ctx.userId,
    })
    .eq("project_id", projectId);
  if (error) return { error: "Could not save the changes." };

  refresh(ws, projectId, clientId);
  return { error: null, success: "Intake updated." };
}

// ---- commercials: executives and the assigned manager only ----

export async function saveProjectCommercials(
  _prev: IntakeActionState,
  formData: FormData
): Promise<IntakeActionState> {
  const ws = String(formData.get("ws") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "") || null;
  const ctx = await getWorkspaceContext(ws);

  const priceRaw = String(formData.get("price") ?? "").trim();
  let price: number | null = null;
  if (priceRaw) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Enter a valid price." };
    price = n;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_commercials").upsert({
    project_id: projectId,
    price,
    invoice_terms: String(formData.get("invoice_terms") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return { error: "Only executives and the assigned manager can edit pricing." };
  }

  refresh(ws, projectId, clientId);
  return { error: null, success: "Commercials saved." };
}
