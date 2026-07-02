"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";
import type { Archetype, RoleType, WallSide } from "@/lib/types";

// Org actions. Reporting lines drive both permission scope and KPI rollups
// because both read memberships.reports_to. Onboarding and offboarding use
// the admin client after an explicit executive check.

export interface TeamActionState {
  error: string | null;
  success?: string | null;
}

const ROLES: RoleType[] = [
  "ceo", "cfo", "ops_manager", "creative_lead", "marketing_manager",
  "design_lead", "animation_lead", "editing_lead",
  "designer", "animator", "editor", "marketer", "closer", "appointment_setter",
];
const ARCHETYPES: Archetype[] = [
  "executive", "domain_manager", "team_lead", "contributor", "revenue",
];

export async function updateReportsTo(
  ws: string,
  profileId: string,
  reportsTo: string | null
): Promise<TeamActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") {
    return { error: "Only executives can change reporting lines." };
  }
  if (reportsTo === profileId) {
    return { error: "People cannot report to themselves." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ reports_to: reportsTo })
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId);
  if (error) return { error: "Could not update the reporting line." };

  revalidatePath(`/${ws}/team`);
  revalidatePath(`/${ws}/team/${profileId}`);
  return { error: null, success: "Reporting line updated." };
}

export async function onboardPerson(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") {
    return { error: "Only executives can onboard people." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const archetype = String(formData.get("archetype") ?? "");
  const wallSide = String(formData.get("wall_side") ?? "");
  const reportsTo = String(formData.get("reports_to") ?? "");

  if (!fullName) return { error: "Enter the person's name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "The temporary password needs at least 8 characters." };
  if (!ROLES.includes(role as RoleType)) return { error: "Pick a role." };
  if (!ARCHETYPES.includes(archetype as Archetype)) return { error: "Pick an archetype." };
  if (wallSide !== "above" && wallSide !== "below") return { error: "Pick a wall side." };

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created?.user) {
    return {
      error: createError?.message.includes("already")
        ? "A user with that email already exists."
        : "Could not create the account. Try again.",
    };
  }

  // The auth trigger creates the profile; make sure the name matches, then
  // add the membership and a leave balance for this year.
  await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    email,
  });
  const { error: membershipError } = await admin.from("memberships").insert({
    profile_id: created.user.id,
    workspace_id: ctx.workspace.id,
    role: role as RoleType,
    archetype: archetype as Archetype,
    wall_side: wallSide as WallSide,
    reports_to: reportsTo || null,
  });
  if (membershipError) {
    return { error: "The account was created but the membership failed. Check the admin screen." };
  }
  await admin.from("leave_balances").insert({
    workspace_id: ctx.workspace.id,
    profile_id: created.user.id,
    year: new Date().getFullYear(),
    total_days: 20,
  });

  revalidatePath(`/${ws}/team`);
  return { error: null, success: `${fullName} is onboarded.` };
}

export async function offboardPerson(
  ws: string,
  profileId: string
): Promise<TeamActionState> {
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") {
    return { error: "Only executives can offboard people." };
  }
  if (profileId === ctx.userId) {
    return { error: "You cannot offboard yourself." };
  }

  const admin = createAdminClient();
  const { error: membershipError } = await admin
    .from("memberships")
    .update({ is_active: false })
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId);
  if (membershipError) return { error: "Could not offboard this person." };
  await admin.from("profiles").update({ is_active: false }).eq("id", profileId);

  revalidatePath(`/${ws}/team`);
  revalidatePath(`/${ws}/team/${profileId}`);
  return { error: null, success: "Membership deactivated." };
}
