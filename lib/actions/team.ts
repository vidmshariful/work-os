"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";

// Org actions. Reporting lines drive both permission scope and KPI rollups
// because both read memberships.reports_to. Onboarding and offboarding use
// the admin client after an explicit executive check.

export interface TeamActionState {
  error: string | null;
  success?: string | null;
}


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
