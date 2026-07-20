import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { WorkspaceRail } from "@/components/shell/workspace-rail";
import { Sidebar, ROLE_LABELS } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import type { DeptTreeItem } from "@/components/shell/department-tree";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [
    { count: myTaskCount },
    { count: unreadCount },
    { data: deptRows },
    { data: listRows },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, project:projects!inner(workspace_id)", {
        count: "exact",
        head: true,
      })
      .eq("assignee_id", ctx.userId)
      .eq("project.workspace_id", ctx.workspace.id)
      .not("status", "in", "(done)"),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", ctx.userId)
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_read", false),
    supabase
      .from("departments")
      .select("id, name, slug, accent_color")
      .eq("workspace_id", ctx.workspace.id)
      .order("sort_order"),
    supabase.from("project_lists").select("id, name, department_id").order("sort_order"),
  ]);

  const roleLabel = ROLE_LABELS[ctx.membership.role] ?? ctx.membership.role;

  const deptLists = (listRows ?? []) as {
    id: string;
    name: string;
    department_id: string;
  }[];
  const departments: DeptTreeItem[] = (
    (deptRows ?? []) as {
      id: string;
      name: string;
      slug: string;
      accent_color: string;
    }[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    accent_color: d.accent_color,
    lists: deptLists
      .filter((l) => l.department_id === d.id)
      .map((l) => ({ id: l.id, name: l.name })),
  }));

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <div className="hidden md:flex">
        <WorkspaceRail
          workspaces={ctx.memberships.map((m) => m.workspace)}
          activeSlug={ctx.workspace.slug}
        />
      </div>
      <div className="hidden md:flex">
        <Sidebar
          workspace={ctx.workspace}
          profile={ctx.profile}
          roleLabel={roleLabel}
          navGroups={ctx.navGroups}
          myTaskCount={myTaskCount ?? 0}
          departments={departments}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspace={ctx.workspace}
          profile={ctx.profile}
          roleLabel={roleLabel}
          capabilities={ctx.capabilities}
          navGroups={ctx.navGroups}
          myTaskCount={myTaskCount ?? 0}
          unreadCount={unreadCount ?? 0}
          userId={ctx.userId}
          departments={departments}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1160px] px-5 py-6 md:px-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
