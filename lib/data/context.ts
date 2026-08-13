import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Membership,
  Profile,
  Workspace,
  WorkspaceFeature,
  WorkspaceSettings,
} from "@/lib/types";
import { capabilitiesFor, navGroupsFor, type Capabilities, type NavGroup } from "@/lib/rbac";
import {
  enabledKeysFor,
  featureAllows,
  pickFeatures,
  pickSettings,
} from "@/lib/data/workspace-settings";

export interface SessionContext {
  userId: string;
  profile: Profile;
  // Only this user's memberships, each joined to its workspace. This list is
  // the entire universe of workspaces the UI may ever render. Guarantee 2.
  memberships: (Membership & { workspace: Workspace })[];
}

export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  // getClaims, not getUser. The project signs tokens with ES256, so the JWT
  // is verified locally against the cached signing keys in about a
  // millisecond, where getUser is a ~100ms round trip to the auth server on
  // every page. The middleware still calls getUser on every request, which
  // is what refreshes the cookie; and even a forged token buys nothing here,
  // because every query below runs under RLS with that same token.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("memberships")
      .select("*, workspace:workspaces(*)")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .order("created_at"),
  ]);

  if (!profile) redirect("/login");

  return {
    userId,
    profile: profile as Profile,
    memberships: (memberships ?? []) as SessionContext["memberships"],
  };
});

export interface WorkspaceContext extends SessionContext {
  workspace: Workspace;
  membership: Membership;
  capabilities: Capabilities;
  navGroups: NavGroup[];
  aboveWall: boolean;
  // The workspace-level settings and feature switchboard, resolved once here
  // so no screen queries them itself.
  settings: WorkspaceSettings;
  features: WorkspaceFeature[];
  // True when this feature is on for this member's archetype.
  hasFeature: (featureKey: string) => boolean;
}

// Resolves the active workspace by slug and confirms membership. A slug the
// user does not belong to behaves exactly like one that does not exist.
export const getWorkspaceContext = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    // Settings and features start before the session resolves, not after.
    // They only need RLS to scope them, and waiting for the membership row
    // first was a second full round trip on every page. The workspace id is
    // matched below, once both are in hand.
    const supabase = await createClient();
    const settingsQ = supabase.from("workspace_settings").select("*");
    const featuresQ = supabase.from("workspace_features").select("*");
    const [session, { data: settingsRows }, { data: featuresRows }] =
      await Promise.all([getSession(), settingsQ, featuresQ]);
    const hit = session.memberships.find((m) => m.workspace?.slug === slug);
    if (!hit) redirect("/dashboard");

    const settings = pickSettings(settingsRows, hit.workspace.id);
    const features = pickFeatures(featuresRows, hit.workspace.id);

    return {
      ...session,
      workspace: hit.workspace,
      membership: hit,
      capabilities: capabilitiesFor(hit.archetype, hit.wall_side),
      navGroups: navGroupsFor(hit.archetype, enabledKeysFor(features, hit.archetype)),
      aboveWall: hit.wall_side === "above",
      settings,
      features,
      hasFeature: (featureKey: string) =>
        featureAllows(features, featureKey, hit.archetype),
    };
  }
);
