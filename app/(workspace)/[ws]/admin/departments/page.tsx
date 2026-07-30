import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";
import {
  DepartmentAdmin,
  type DeptAdminMember,
  type DeptAdminRow,
} from "@/components/features/admin/department-admin";
import type { Department } from "@/lib/types";

export const metadata: Metadata = { title: "Spaces" };

interface ProfileRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default async function AdminDepartmentsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [
    { data: deptRows },
    { data: memberRows },
    { data: wsMemberRows },
    { data: projRows },
    { data: listRows },
  ] = await Promise.all([
      supabase
        .from("departments")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
      supabase
        .from("department_members")
        .select("department_id, profile:profiles!profile_id(id, full_name, avatar_url)"),
      supabase
        .from("memberships")
        .select("profile:profiles!profile_id(id, full_name, avatar_url)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      // Quoted in the delete confirmation, so it states what will happen to
      // this space's work rather than warning in the abstract.
      supabase
        .from("projects")
        .select("department_id")
        .eq("workspace_id", ctx.workspace.id),
      supabase.from("project_lists").select("department_id"),
    ]);

  const projectCount = new Map<string, number>();
  for (const p of (projRows ?? []) as { department_id: string | null }[]) {
    if (p.department_id)
      projectCount.set(p.department_id, (projectCount.get(p.department_id) ?? 0) + 1);
  }
  const listCount = new Map<string, number>();
  for (const l of (listRows ?? []) as { department_id: string }[]) {
    listCount.set(l.department_id, (listCount.get(l.department_id) ?? 0) + 1);
  }

  const membersByDept = new Map<string, DeptAdminMember[]>();
  for (const row of (memberRows ?? []) as unknown as {
    department_id: string;
    profile: ProfileRef | null;
  }[]) {
    if (!row.profile) continue;
    const list = membersByDept.get(row.department_id) ?? [];
    list.push({
      id: row.profile.id,
      name: row.profile.full_name,
      avatar_url: row.profile.avatar_url,
    });
    membersByDept.set(row.department_id, list);
  }

  const departments: DeptAdminRow[] = ((deptRows ?? []) as Department[]).map(
    (d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      accent_color: d.accent_color,
      is_default: d.is_default,
      members: (membersByDept.get(d.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      projectCount: projectCount.get(d.id) ?? 0,
      listCount: listCount.get(d.id) ?? 0,
    })
  );

  const allMembers = ((wsMemberRows ?? []) as unknown as { profile: ProfileRef }[])
    .map((m) => ({
      id: m.profile.id,
      name: m.profile.full_name,
      avatar_url: m.profile.avatar_url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <DepartmentAdmin ws={ws} departments={departments} allMembers={allMembers} />;
}
