"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORIGIN_LABELS } from "@/lib/wall";
import type { BrandOrigin, ClientStatus } from "@/lib/types";

// Client writes go through the admin client because the base clients table is
// revoked from application roles. Every action here re-checks the wall gate
// server-side before touching it.

export interface ClientFormState {
  error: string | null;
  success?: boolean;
}

const CLIENT_STATUSES: ClientStatus[] = [
  "active",
  "paused",
  "completed",
  "archived",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WriteContext = Awaited<ReturnType<typeof getWorkspaceContext>>;

// The wall gate for client writes: above the wall, or the revenue archetype
// (closers and setters record the deals they close). RLS-equivalent revoke on
// the base table is the real enforcement; this gives a friendly error.
function canWriteClients(ctx: WriteContext) {
  return (
    ctx.membership.wall_side === "above" ||
    ctx.membership.archetype === "revenue"
  );
}

interface CommercialFields {
  commercial_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contract_value: number | null;
  status: ClientStatus;
  owner_id: string | null;
}

function parseCommercialFields(
  formData: FormData
): { error: string; fields?: undefined } | { error?: undefined; fields: CommercialFields } {
  const commercial_name = String(formData.get("commercial_name") ?? "").trim();
  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contractRaw = String(formData.get("contract_value") ?? "").trim();
  const status = String(formData.get("status") ?? "active");
  const ownerRaw = String(formData.get("owner_id") ?? "").trim();

  if (!commercial_name) return { error: "Enter the commercial name." };
  if (contact_email && !/^\S+@\S+\.\S+$/.test(contact_email)) {
    return { error: "Enter a valid contact email." };
  }

  let contract_value: number | null = null;
  if (contractRaw) {
    const n = Number(contractRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Enter a valid contract value." };
    }
    contract_value = n;
  }

  if (!CLIENT_STATUSES.includes(status as ClientStatus)) {
    return { error: "Pick a valid status." };
  }

  const owner_id = ownerRaw && ownerRaw !== "none" ? ownerRaw : null;
  if (owner_id && !UUID_RE.test(owner_id)) {
    return { error: "Pick a valid owner." };
  }

  return {
    fields: {
      commercial_name,
      contact_name: contact_name || null,
      contact_email: contact_email || null,
      contract_value,
      status: status as ClientStatus,
      owner_id,
    },
  };
}

// Confirms the chosen owner is an active member of this workspace, read
// under the caller's own RLS.
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

export async function createClientRecord(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);

  if (!canWriteClients(ctx)) {
    return { error: "You do not have access to create clients." };
  }

  const parsed = parseCommercialFields(formData);
  if (!parsed.fields) return { error: parsed.error ?? "Check the form and try again." };

  const origin = String(formData.get("origin") ?? "direct");
  if (!(origin in ORIGIN_LABELS)) {
    return { error: "Pick a valid origin." };
  }

  if (parsed.fields.owner_id) {
    const ok = await ownerIsMember(ctx.workspace.id, parsed.fields.owner_id);
    if (!ok) return { error: "The owner must be an active member of this workspace." };
  }

  const admin = createAdminClient();

  const { data: code, error: codeError } = await admin.rpc("next_code", {
    ws: ctx.workspace.id,
    kind: "client",
  });
  if (codeError || !code) {
    return { error: "Could not generate a client code. Try again." };
  }

  // The insert fires the database handoff trigger, which scaffolds the
  // kickoff project from the default template, assigns the owner, and
  // notifies the team. Nothing to duplicate here.
  const { data: inserted, error: insertError } = await admin
    .from("clients")
    .insert({
      workspace_id: ctx.workspace.id,
      code: code as string,
      commercial_name: parsed.fields.commercial_name,
      contact_name: parsed.fields.contact_name,
      contact_email: parsed.fields.contact_email,
      origin: origin as BrandOrigin,
      contract_value: parsed.fields.contract_value,
      status: parsed.fields.status,
      owner_id: parsed.fields.owner_id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: "Could not create the client. Try again." };
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
  if (!UUID_RE.test(id)) {
    return { error: "This client could not be found." };
  }

  const parsed = parseCommercialFields(formData);
  if (!parsed.fields) return { error: parsed.error ?? "Check the form and try again." };

  const update: Record<string, unknown> = { ...parsed.fields };

  // Origin is the most sensitive field. Only executives may change it, and
  // the field is only offered to them in the UI to begin with.
  const originRaw = formData.get("origin");
  if (originRaw !== null) {
    if (ctx.membership.archetype !== "executive") {
      return { error: "Only executives can change a client origin." };
    }
    const origin = String(originRaw);
    if (!(origin in ORIGIN_LABELS)) {
      return { error: "Pick a valid origin." };
    }
    update.origin = origin as BrandOrigin;
  }

  if (parsed.fields.owner_id) {
    const ok = await ownerIsMember(ctx.workspace.id, parsed.fields.owner_id);
    if (!ok) return { error: "The owner must be an active member of this workspace." };
  }

  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("clients")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");

  if (updateError) {
    return { error: "Could not save the changes. Try again." };
  }
  if (!updated || updated.length === 0) {
    return { error: "This client could not be found." };
  }

  revalidatePath(`/${ws}/clients`);
  revalidatePath(`/${ws}/clients/${id}`);
  return { error: null, success: true };
}
