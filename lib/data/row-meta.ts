import { createClient } from "@/lib/supabase/server";
import type { OwnerRef, RowMetaMap } from "@/components/features/projects/types";

// The extra people on a project and how many files it carries, for a page of
// rows at once.
//
// Two reads for the whole page rather than two per row. Both are scoped by
// the reader: project_assignees inherits projects_select through its inline
// EXISTS, and project_file_counts repeats the same visibility rule inside
// itself because storage.objects is not readable by anyone but the definer.
export async function loadRowMeta(projectIds: string[]): Promise<RowMetaMap> {
  const meta: RowMetaMap = {};
  if (projectIds.length === 0) return meta;

  const supabase = await createClient();
  const [{ data: assigneeRows }, { data: fileRows }] = await Promise.all([
    supabase
      .from("project_assignees")
      .select("project_id, profile:profiles!profile_id!inner(id, full_name, avatar_url)")
      .in("project_id", projectIds),
    supabase.rpc("project_file_counts", { ids: projectIds }),
  ]);

  for (const id of projectIds) meta[id] = { assignees: [], files: 0 };

  for (const row of (assigneeRows ?? []) as unknown as {
    project_id: string;
    profile: OwnerRef;
  }[]) {
    if (!row.profile) continue;
    (meta[row.project_id] ??= { assignees: [], files: 0 }).assignees.push(row.profile);
  }
  for (const list of Object.values(meta)) {
    list.assignees.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  for (const row of (fileRows ?? []) as { project_id: string; files: number }[]) {
    const entry = meta[row.project_id];
    if (entry) entry.files = Number(row.files) || 0;
  }

  return meta;
}
