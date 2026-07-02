import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Profile, Workspace } from "@/lib/types";
import { capabilitiesFor, navGroupsFor, type Capabilities, type NavGroup } from "@/lib/rbac";

export interface SessionContext {
  userId: string;
  profile: Profile;
  // Only this user's memberships, each joined to its workspace. This list is
  // the entire universe of workspaces the UI may ever render. Guarantee 2.
  memberships: (Membership & { workspace: Workspace })[];
}

export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("memberships")
      .select("*, workspace:workspaces(*)")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at"),
  ]);

  if (!profile) redirect("/login");

  return {
    userId: user.id,
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
}

// Resolves the active workspace by slug and confirms membership. A slug the
// user does not belong to behaves exactly like one that does not exist.
export const getWorkspaceContext = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const session = await getSession();
    const hit = session.memberships.find((m) => m.workspace?.slug === slug);
    if (!hit) redirect("/dashboard");
    return {
      ...session,
      workspace: hit.workspace,
      membership: hit,
      capabilities: capabilitiesFor(hit.archetype, hit.wall_side),
      navGroups: navGroupsFor(hit.archetype),
      aboveWall: hit.wall_side === "above",
    };
  }
);
