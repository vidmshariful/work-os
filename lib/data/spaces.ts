import { createClient } from "@/lib/supabase/server";
import type { Archetype } from "@/lib/types";
import type { SpacePerson } from "@/components/features/departments/space-settings";

export interface SpaceDirectory {
  // Everyone holding a department_members row, keyed by department. This is
  // the set app_can_see_department() reads, executives included.
  membersByDept: Map<string, SpacePerson[]>;
  // Every active executive in the workspace, row or no row. They see every
  // space through the first branch of app_can_see_department().
  executives: SpacePerson[];
  // Everyone active in the workspace, which is the pool the add search draws
  // from before it removes people who are already in.
  everyone: SpacePerson[];
}

const EMPTY: SpaceDirectory = {
  membersByDept: new Map(),
  executives: [],
  everyone: [],
};

interface Row {
  profile: { id: string; full_name: string; avatar_url: string | null } | null;
  archetype: Archetype;
}

// Loaded once per page for the space settings panel. Only worth calling for
// an executive: everything the panel does is executive gated, and
// department_members_select would hand a non-executive only the spaces they
// are already in.
export async function loadSpaceDirectory(
  workspaceId: string,
  isExecutive: boolean
): Promise<SpaceDirectory> {
  if (!isExecutive) return EMPTY;

  const supabase = await createClient();
  const [{ data: memberRows }, { data: peopleRows }] = await Promise.all([
    supabase.from("department_members").select("department_id, profile_id"),
    supabase
      .from("memberships")
      .select("archetype, profile:profiles!profile_id!inner(id, full_name, avatar_url)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const everyone: SpacePerson[] = ((peopleRows ?? []) as unknown as Row[])
    .filter((r) => r.profile)
    .map((r) => ({
      id: r.profile!.id,
      name: r.profile!.full_name,
      avatar_url: r.profile!.avatar_url,
      archetype: r.archetype,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const byId = new Map(everyone.map((p) => [p.id, p]));
  const membersByDept = new Map<string, SpacePerson[]>();
  for (const row of (memberRows ?? []) as {
    department_id: string;
    profile_id: string;
  }[]) {
    // Someone deactivated in the workspace still holds their row, but they
    // are not a person the panel can act on, so they are left out.
    const person = byId.get(row.profile_id);
    if (!person) continue;
    const list = membersByDept.get(row.department_id) ?? [];
    list.push(person);
    membersByDept.set(row.department_id, list);
  }
  for (const list of membersByDept.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    membersByDept,
    executives: everyone.filter((p) => p.archetype === "executive"),
    everyone,
  };
}
