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
    { data: folderRows },
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
      .select("id, name, slug, accent_color, icon")
      .eq("workspace_id", ctx.workspace.id)
      // Archived spaces leave the sidebar. They are still reachable from the
      // index and from a direct link, and nobody's access changed.
      .is("archived_at", null)
      .order("sort_order"),
    // Archived lists leave the sidebar, the way archived spaces already do.
    supabase
      .from("project_lists")
      .select("id, name, department_id, folder_id")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("project_folders")
      .select("id, name, department_id, color")
      .order("sort_order"),
  ]);

  const roleLabel = ROLE_LABELS[ctx.membership.role] ?? ctx.membership.role;

  const deptLists = (listRows ?? []) as {
    id: string;
    name: string;
    department_id: string;
    folder_id: string | null;
  }[];
  const deptFolders = (folderRows ?? []) as {
    id: string;
    name: string;
    department_id: string;
    color: string | null;
  }[];
  const departments: DeptTreeItem[] = (
    (deptRows ?? []) as {
      id: string;
      name: string;
      slug: string;
      accent_color: string;
      icon: string | null;
    }[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    accent_color: d.accent_color,
    icon: d.icon,
    folders: deptFolders
      .filter((f) => f.department_id === d.id)
      .map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        lists: deptLists
          .filter((l) => l.folder_id === f.id)
          .map((l) => ({ id: l.id, name: l.name })),
      })),
    // Only the loose ones here; the rest hang off their folder above.
    lists: deptLists
      .filter((l) => l.department_id === d.id && !l.folder_id)
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
