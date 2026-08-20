"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";
import type { Archetype, RoleType, WallSide } from "@/lib/types";

// Membership as an invitation rather than a handout. The old path had an
// executive invent a temporary password and pass it along in a chat message,
// where it usually stayed. Here the person sets their own and the password
// never exists anywhere to be leaked.
//
// Everything below runs through the service role, because creating an auth
// user is not something a policy can grant. The archetype check at the top of
// each action is therefore the whole gate, not a nicety, so it comes first
// and it is repeated in every one of them.

export interface PeopleState {
  error: string | null;
  success?: string | null;
  // The invitation link. Shown to the admin so they can pass it on themselves
  // if the studio's mail is not set up to deliver it.
  link?: string | null;
}

const ROLES: RoleType[] = [
  "ceo", "cfo", "ops_manager", "creative_lead", "marketing_manager",
  "design_lead", "animation_lead", "editing_lead", "designer", "animator",
  "editor", "marketer", "closer", "appointment_setter",
];
const ARCHETYPES: Archetype[] = [
  "executive", "domain_manager", "team_lead", "contributor", "revenue",
];

async function requireExecutive(ws: string) {
  const ctx = await getWorkspaceContext(ws);
  if (ctx.membership.archetype !== "executive") return null;
  return ctx;
}

// Where the invitation link should land.
//
// Not /reset/confirm, which was the obvious guess and is wrong. That route
// reads a ?code= parameter, which the forgotten password flow produces
// because the browser starts it and holds the matching verifier. A link an
// admin generates on the server has no verifier, so Supabase returns the
// session in the URL fragment instead, and a fragment never reaches a server.
// /invite/accept is a client page that can read it.
async function inviteRedirect() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/invite/accept`;
}

export async function invitePerson(
  _prev: PeopleState,
  formData: FormData
): Promise<PeopleState> {
  const ws = String(formData.get("ws") ?? "");
  const ctx = await requireExecutive(ws);
  if (!ctx) return { error: "Only an admin can invite people." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const archetype = String(formData.get("archetype") ?? "");
  const wallSide = String(formData.get("wall_side") ?? "");
  const reportsTo = String(formData.get("reports_to") ?? "");

  if (!fullName) return { error: "Enter the person's name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role as RoleType)) return { error: "Pick a job title." };
  if (!ARCHETYPES.includes(archetype as Archetype)) return { error: "Pick an access level." };
  if (wallSide !== "above" && wallSide !== "below") return { error: "Pick a wall side." };

  const admin = createAdminClient();

  // Already here? Say which case it is, because "already exists" leaves an
  // admin guessing whether to re-invite or go and reactivate somebody.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    const { data: member } = await admin
      .from("memberships")
      .select("is_active")
      .eq("workspace_id", ctx.workspace.id)
      .eq("profile_id", existing.id)
      .maybeSingle();
    if (member?.is_active) return { error: "That person is already on the team." };
    if (member) return { error: "That person was deactivated. Reactivate them from their row instead." };
  }

  // Creates the account in an invited state and hands back a one-time link.
  // No password is set, so there is nothing to pass along and nothing to leak.
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName },
      redirectTo: await inviteRedirect(),
    },
  });
  if (inviteError || !invited?.user) {
    return { error: `The invitation could not be created. ${inviteError?.message ?? ""}`.trim() };
  }

  const profileId = invited.user.id;
  await admin.from("profiles").upsert({ id: profileId, full_name: fullName, email });

  const { error: membershipError } = await admin.from("memberships").insert({
    profile_id: profileId,
    workspace_id: ctx.workspace.id,
    role: role as RoleType,
    archetype: archetype as Archetype,
    wall_side: wallSide as WallSide,
    reports_to: reportsTo || null,
    invited_at: new Date().toISOString(),
    invited_by: ctx.userId,
  });
  if (membershipError) {
    // Leave nothing half made. Without this an admin retrying the same email
    // hits "already on the team" for somebody who was never added.
    await admin.auth.admin.deleteUser(profileId).catch(() => {});
    await admin.from("profiles").delete().eq("id", profileId);
    return { error: "The account was created but adding them to the workspace failed, so it was undone." };
  }

  await admin.from("leave_balances").insert({
    workspace_id: ctx.workspace.id,
    profile_id: profileId,
    year: new Date().getFullYear(),
    total_days: 20,
  });

  revalidatePath(`/${ws}/admin/people`);
  revalidatePath(`/${ws}/team`);
  return {
    error: null,
    success: `${fullName} has been invited.`,
    link: invited.properties?.action_link ?? null,
  };
}

// A fresh link for somebody who lost theirs or let it expire. Only for an
// invitation still outstanding: once a person has signed in, the way back in
// is the ordinary forgotten password flow, not an admin handing out links.
export async function resendInvite(
  ws: string,
  profileId: string
): Promise<PeopleState> {
  const ctx = await requireExecutive(ws);
  if (!ctx) return { error: "Only an admin can resend an invitation." };

  const admin = createAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(profileId);
  if (!user?.user) return { error: "That account no longer exists." };
  if (user.user.last_sign_in_at) {
    return { error: "They have already signed in, so they do not need an invitation." };
  }

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: user.user.email!,
    options: { redirectTo: await inviteRedirect() },
  });
  if (error || !link) return { error: "A new link could not be created." };

  await admin
    .from("memberships")
    .update({ invited_at: new Date().toISOString(), invited_by: ctx.userId })
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId);

  revalidatePath(`/${ws}/admin/people`);
  return { error: null, success: "A new link is ready.", link: link.properties?.action_link ?? null };
}

// Take back an invitation nobody accepted. This one really deletes, because
// an account that was never used has no history worth keeping. Anyone who has
// signed in is deactivated instead, never erased.
export async function revokeInvite(
  ws: string,
  profileId: string
): Promise<PeopleState> {
  const ctx = await requireExecutive(ws);
  if (!ctx) return { error: "Only an admin can revoke an invitation." };
  if (profileId === ctx.userId) return { error: "You cannot revoke your own membership." };

  const admin = createAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(profileId);
  if (user?.user?.last_sign_in_at) {
    return { error: "They have already signed in. Deactivate them instead, so their work keeps its history." };
  }

  // reports_to does not cascade, so anybody pointed at this person has to be
  // let go of first or the delete is refused by the foreign key.
  await admin
    .from("memberships")
    .update({ reports_to: null })
    .eq("workspace_id", ctx.workspace.id)
    .eq("reports_to", profileId);

  await admin.from("memberships").delete().eq("workspace_id", ctx.workspace.id).eq("profile_id", profileId);
  await admin.from("leave_balances").delete().eq("workspace_id", ctx.workspace.id).eq("profile_id", profileId);
  await admin.from("profiles").delete().eq("id", profileId);
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) return { error: "The invitation was removed but the sign-in account remains. Try again." };

  revalidatePath(`/${ws}/admin/people`);
  revalidatePath(`/${ws}/team`);
  return { error: null, success: "Invitation revoked." };
}

// Somebody who was deactivated comes back. Their history, their tasks and
// their leave record are all still attached, which is the whole reason
// deactivating is not deleting.
export async function reactivatePerson(
  ws: string,
  profileId: string
): Promise<PeopleState> {
  const ctx = await requireExecutive(ws);
  if (!ctx) return { error: "Only an admin can reactivate someone." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("memberships")
    .update({ is_active: true })
    .eq("workspace_id", ctx.workspace.id)
    .eq("profile_id", profileId);
  if (error) return { error: "Could not reactivate this person." };
  await admin.from("profiles").update({ is_active: true }).eq("id", profileId);

  revalidatePath(`/${ws}/admin/people`);
  revalidatePath(`/${ws}/team`);
  return { error: null, success: "They are back on the team." };
}
