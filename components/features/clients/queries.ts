import { createClient } from "@/lib/supabase/server";

// Server-only data helpers for the clients area. Reads run under the
// caller's RLS.

export interface OwnerOption {
  id: string;
  name: string;
}

export interface OwnerProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

// Members eligible to own a client: anyone above the wall plus the revenue
// archetype. Mirrors the write gate in lib/actions/clients.ts.
export async function getOwnerOptions(
  workspaceId: string
): Promise<OwnerOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("profile_id, archetype, wall_side, profile:profiles!profile_id(full_name)")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  const rows = (data ?? []) as unknown as {
    profile_id: string;
    archetype: string;
    wall_side: string;
    profile: { full_name: string } | null;
  }[];

  return rows
    .filter((r) => r.wall_side === "above" || r.archetype === "revenue")
    .map((r) => ({ id: r.profile_id, name: r.profile?.full_name ?? "Unknown member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Profiles for a set of owner ids, keyed by id for row rendering.
export async function getOwnerProfiles(
  ownerIds: string[]
): Promise<Record<string, OwnerProfile>> {
  if (ownerIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", ownerIds);
  const map: Record<string, OwnerProfile> = {};
  for (const p of (data ?? []) as OwnerProfile[]) map[p.id] = p;
  return map;
}
