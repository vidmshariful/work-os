import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Archetype, ProjectFieldOption } from "@/lib/types";
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

// The choice fields a board card draws, and their values, for one space.
//
// Two surfaces show that board, the space page and a list page inside it,
// and the first version of this wired only the space page, so opening a list
// lost the stages. Loading it in one place is what stops the next surface
// from losing them again.
//
// Values come back under the reader's own RLS, the same as the projects, so
// this adds no visibility. At most two fields, the space's own before the
// workspace-wide ones, because a card is a glance.
export interface CardFields {
  fields: { id: string; name: string; options: ProjectFieldOption[] }[];
  values: Record<string, Record<string, string>>;
}

export async function loadCardFields(
  supabase: SupabaseClient,
  workspaceId: string,
  // Null on a surface that spans spaces, such as the Projects index. There
  // only the workspace-wide fields apply, because a field scoped to
  // Production means nothing on a Marketing card.
  departmentId: string | null
): Promise<CardFields> {
  const [{ data: fieldRows }, { data: valueRows }] = await Promise.all([
    supabase
      .from("project_fields")
      .select("id, name, options, department_id")
      .eq("workspace_id", workspaceId)
      .eq("kind", "select")
      .order("sort_order"),
    supabase.from("project_field_values").select("project_id, field_id, value"),
  ]);

  const fields = ((fieldRows ?? []) as {
    id: string;
    name: string;
    options: ProjectFieldOption[] | null;
    department_id: string | null;
  }[])
    .filter((f) =>
      departmentId === null
        ? f.department_id === null
        : f.department_id === null || f.department_id === departmentId
    )
    .sort((a, b) => Number(Boolean(b.department_id)) - Number(Boolean(a.department_id)))
    .slice(0, 2)
    .map((f) => ({ id: f.id, name: f.name, options: f.options ?? [] }));

  const values: Record<string, Record<string, string>> = {};
  for (const v of (valueRows ?? []) as {
    project_id: string;
    field_id: string;
    value: unknown;
  }[]) {
    if (typeof v.value !== "string") continue;
    (values[v.project_id] ??= {})[v.field_id] = v.value;
  }

  return { fields, values };
}
