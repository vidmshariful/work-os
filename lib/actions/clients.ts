"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORIGIN_LABELS } from "@/lib/wall";
import type { BrandOrigin, ClientStage, KickoffTiming } from "@/lib/types";

// Client writes go through the admin client because the base clients table
// is revoked from application roles. Every action re-checks the wall gate
// server-side first. The workroom tables (contacts, payments, notes, ...)
// write under the USER client in lib/actions/client-work.ts, where RLS is
// the gate.

export interface ClientFormState {
  error: string | null;
  success?: boolean;
}

const STAGES: ClientStage[] = ["onboard", "active", "blocked", "blacklist", "done"];
// on_intake is legacy: intake now lives on each project.
const TIMINGS: KickoffTiming[] = ["immediate", "manual"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WriteContext = Awaited<ReturnType<typeof getWorkspaceContext>>;

// The wall gate for client writes: above the wall, or the revenue archetype.
function canWriteClients(ctx: WriteContext) {
  return (
    ctx.membership.wall_side === "above" ||
    ctx.membership.archetype === "revenue"
  );
}

function cleanUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

async function ownerIsMember(workspaceId: string, ownerId: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", ownerId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

interface PaymentPlanRow {
  label: string;
  amount: number;
  due_date: string | null;
}

function parsePaymentPlan(raw: string): PaymentPlanRow[] | { error: string } {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "The payment plan could not be read." };
  }
  if (!Array.isArray(parsed)) return { error: "The payment plan could not be read." };
  const rows: PaymentPlanRow[] = [];
  for (const item of parsed as { label?: unknown; amount?: unknown; due_date?: unknown }[]) {
    const label = String(item.label ?? "").trim();
    const amount = Number(item.amount);
    const due = String(item.due_date ?? "").trim();
    if (!label && !amount) continue;
    if (!label) return { error: "Every payment needs a label." };
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: `Enter a valid amount for "${label}".` };
    }
    rows.push({ label, amount, due_date: due || null });
  }
  return rows;
}

export async function createClientRecord(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (!canWriteClients(ctx)) {
    return { error: "You do not have access to create clients." };
  }

  const commercialName = String(formData.get("commercial_name") ?? "").trim();
  if (!commercialName) return { error: "Enter the commercial name." };

  const origin = String(formData.get("origin") ?? "direct");
  if (!(origin in ORIGIN_LABELS)) return { error: "Pick a valid origin." };

  const contractRaw = String(formData.get("contract_value") ?? "").trim();
  let contractValue: number | null = null;
  if (contractRaw) {
    const n = Number(contractRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Enter a valid total value." };
    contractValue = n;
  }

  const ownerRaw = String(formData.get("owner_id") ?? "").trim();
  const ownerId = ownerRaw && ownerRaw !== "none" ? ownerRaw : null;
  if (ownerId) {
    if (!UUID_RE.test(ownerId)) return { error: "Pick a valid owner." };
    if (!(await ownerIsMember(ctx.workspace.id, ownerId))) {
      return { error: "The owner must be an active member of this workspace." };
    }
  }

  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    return { error: "Enter a valid contact email." };
  }

  const kickoffTiming = String(formData.get("kickoff_timing") ?? "immediate");
  if (!TIMINGS.includes(kickoffTiming as KickoffTiming)) {
    return { error: "Pick when the kickoff project should be created." };
  }
  const templateRaw = String(formData.get("kickoff_template_id") ?? "").trim();
  const templateId = templateRaw && UUID_RE.test(templateRaw) ? templateRaw : null;

  const kickoffPriceRaw = String(formData.get("kickoff_price") ?? "").trim();
  let kickoffPrice: number | null = null;
  if (kickoffPriceRaw) {
    const n = Number(kickoffPriceRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Enter a valid kickoff price." };
    kickoffPrice = n;
  }
  const invoiceTerms = String(formData.get("invoice_terms") ?? "").trim();

  const plan = parsePaymentPlan(String(formData.get("payment_plan") ?? ""));
  if (!Array.isArray(plan)) return { error: plan.error };

  const admin = createAdminClient();
  const { data: code, error: codeError } = await admin.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "client",
  });
  if (codeError || !code) {
    return { error: "Could not generate a client code. Try again." };
  }

  const { data: inserted, error: insertError } = await admin
    .from("clients")
    .insert({
      workspace_id: ctx.workspace.id,
      code: code as string,
      commercial_name: commercialName,
      origin: origin as BrandOrigin,
      contract_value: contractValue,
      owner_id: ownerId,
      website: cleanUrl(String(formData.get("website") ?? "")),
      highlevel_url: cleanUrl(String(formData.get("highlevel_url") ?? "")),
      kickoff_template_id: templateId,
      kickoff_timing: kickoffTiming as KickoffTiming,
      stage: "onboard",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { error: "Could not create the client. Try again." };
  }

  if (contactName) {
    await admin.from("client_contacts").insert({
      client_id: inserted.id,
      name: contactName,
      email: contactEmail || null,
      phone: contactPhone || null,
      is_primary: true,
    });
  }

  // The kickoff project exists now when timing is immediate: attach the
  // intake form, the price, and the invoice terms to it, and point the
  // payment plan at it.
  let kickoffProjectId: string | null = null;
  if (kickoffTiming === "immediate") {
    const { data: kickoff } = await admin
      .from("projects")
      .select("id")
      .eq("client_id", inserted.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    kickoffProjectId = kickoff?.id ?? null;
    if (kickoffProjectId) {
      const intakeFormUrl = cleanUrl(String(formData.get("intake_form_url") ?? ""));
      if (intakeFormUrl) {
        await admin
          .from("project_intakes")
          .update({ form_url: intakeFormUrl })
          .eq("project_id", kickoffProjectId);
      }
      if (kickoffPrice !== null || invoiceTerms) {
        await admin.from("project_commercials").upsert({
          project_id: kickoffProjectId,
          price: kickoffPrice,
          invoice_terms: invoiceTerms || null,
          updated_by: ctx.userId,
        });
      }
    }
  }

  if (plan.length > 0) {
    await admin.from("client_payments").insert(
      plan.map((p) => ({
        client_id: inserted.id,
        project_id: kickoffProjectId,
        label: p.label,
        amount: p.amount,
        due_date: p.due_date,
        created_by: ctx.userId,
      }))
    );
  }

  revalidatePath(`/${ws}/clients`);
  redirect(`/${ws}/clients/${inserted.id}`);
}

export async function updateClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const ws = String(formData.get("ws") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (!canWriteClients(ctx)) {
    return { error: "You do not have access to edit clients." };
  }
  if (!UUID_RE.test(id)) return { error: "This client could not be found." };

  const commercialName = String(formData.get("commercial_name") ?? "").trim();
  if (!commercialName) return { error: "Enter the commercial name." };

  const contractRaw = String(formData.get("contract_value") ?? "").trim();
  let contractValue: number | null = null;
  if (contractRaw) {
    const n = Number(contractRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Enter a valid total value." };
    contractValue = n;
  }

  const ownerRaw = String(formData.get("owner_id") ?? "").trim();
  const ownerId = ownerRaw && ownerRaw !== "none" ? ownerRaw : null;
  if (ownerId && !(await ownerIsMember(ctx.workspace.id, ownerId))) {
    return { error: "The owner must be an active member of this workspace." };
  }

  const update: Record<string, unknown> = {
    commercial_name: commercialName,
    contract_value: contractValue,
    owner_id: ownerId,
    website: cleanUrl(String(formData.get("website") ?? "")),
    highlevel_url: cleanUrl(String(formData.get("highlevel_url") ?? "")),
  };

  // Origin is the most sensitive field: executives only.
  const originRaw = formData.get("origin");
  if (originRaw !== null) {
    if (ctx.membership.archetype !== "executive") {
      return { error: "Only executives can change a client origin." };
    }
    const origin = String(originRaw);
    if (!(origin in ORIGIN_LABELS)) return { error: "Pick a valid origin." };
    update.origin = origin as BrandOrigin;
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("clients")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error) return { error: "Could not save the changes. Try again." };
  if (!updated || updated.length === 0) return { error: "This client could not be found." };

  revalidatePath(`/${ws}/clients`);
  revalidatePath(`/${ws}/clients/${id}`);
  return { error: null, success: true };
}

export async function updateClientStage(
  ws: string,
  clientId: string,
  stage: ClientStage
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!canWriteClients(ctx)) {
    return { error: "You do not have access to move clients." };
  }
  if (!STAGES.includes(stage)) return { error: "That is not a valid stage." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .update({ stage })
    .eq("id", clientId)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "Could not move the client. Try again." };
  }

  revalidatePath(`/${ws}/clients`);
  revalidatePath(`/${ws}/clients/${clientId}`);
  return { error: null };
}

// Manual kickoff, for clients set to manual timing.
export async function scaffoldKickoffNow(
  ws: string,
  clientId: string
): Promise<{ error: string | null }> {
  const ctx = await getWorkspaceContext(ws);
  if (!canWriteClients(ctx)) return { error: "You do not have access to start the kickoff." };

  // Confirm the client belongs to this workspace under the user's own read.
  const supabase = await createServerClient();
  const { data: row } = await supabase
    .from("v_clients")
    .select("id")
    .eq("id", clientId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!row) return { error: "This client could not be found." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("scaffold_kickoff_project", { cid: clientId });
  if (error) {
    const msg = error.message.includes("blacklisted")
      ? "This client is blacklisted. No new work can be created."
      : error.message.includes("already exists")
        ? "The kickoff project already exists for this client."
        : "Could not scaffold the kickoff project.";
    return { error: msg };
  }

  revalidatePath(`/${ws}/clients/${clientId}`);
  revalidatePath(`/${ws}/projects`);
  return { error: null };
}
