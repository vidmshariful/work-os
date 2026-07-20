import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectBoard } from "@/components/features/projects/project-board";
import { ProjectCalendar } from "@/components/features/departments/project-calendar";
import { CollapsibleProjectList } from "@/components/features/departments/collapsible-project-list";
import type { Department, ProjectList } from "@/lib/types";
import type {
  CompletionMap,
  ProjectWithOwner,
} from "@/components/features/projects/types";

export const metadata: Metadata = { title: "List" };

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; slug: string; listId: string }>;
  searchParams: Promise<{ view?: string; m?: string }>;
}) {
  const { ws, slug, listId } = await params;
  const sp = await searchParams;
  const view =
    sp.view === "board" || sp.view === "calendar" ? sp.view : "list";
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: deptRow } = await supabase
    .from("departments")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .eq("slug", slug)
    .maybeSingle();
  if (!deptRow) notFound();
  const dept = deptRow as Department;

  const { data: listRow } = await supabase
    .from("project_lists")
    .select("*")
    .eq("id", listId)
    .eq("department_id", dept.id)
    .maybeSingle();
  if (!listRow) notFound();
  const list = listRow as ProjectList;

  const [{ data: projectRows }, { data: taskRows }] = await Promise.all([
    supabase
      .from("projects")
      .select("*, owner:profiles(id, full_name, avatar_url)")
      .eq("department_id", dept.id)
      .eq("list_id", listId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("project_id, status, project:projects!inner(list_id)")
      .eq("project.list_id", listId),
  ]);

  const projects = (projectRows ?? []) as unknown as ProjectWithOwner[];
  const completion: CompletionMap = {};
  for (const t of (taskRows ?? []) as { project_id: string; status: string }[]) {
    const c = (completion[t.project_id] ??= { done: 0, total: 0 });
    c.total += 1;
    if (t.status === "done") c.done += 1;
  }
  const canManage = ctx.capabilities.canCreateProjects;

  const tops = projects.filter((p) => !p.parent_project_id);
  const base = `/${ws}/departments/${slug}/lists/${listId}`;
  const month =
    typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m)
      ? sp.m
      : new Date().toISOString().slice(0, 7);

  const tab = (key: string, label: string) => (
    <Link
      href={`${base}${key === "list" ? "" : `?view=${key}`}`}
      className={cn(
        "rounded-[7px] px-3 py-1 text-[13px] font-medium transition-colors",
        view === key ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: `/${ws}/departments` },
          { label: dept.name, href: `/${ws}/departments/${slug}` },
          { label: list.name },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">{list.name}</h1>
          <p className="mt-1 text-sm text-text-2">
            {tops.length} project{tops.length === 1 ? "" : "s"} in {dept.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
            {tab("list", "List")}
            {tab("board", "Board")}
            {tab("calendar", "Calendar")}
          </div>
          {canManage ? (
            <Button asChild>
              <Link href={`/${ws}/projects/new?department=${dept.id}&list=${listId}`}>
                <Plus />
                New project
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title="No projects in this list yet."
            action={
              canManage ? (
                <Button asChild>
                  <Link href={`/${ws}/projects/new?department=${dept.id}&list=${listId}`}>
                    New project
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "board" ? (
        <ProjectBoard ws={ws} projects={projects} completion={completion} />
      ) : view === "calendar" ? (
        <ProjectCalendar ws={ws} base={`${base}?view=calendar`} month={month} projects={projects} />
      ) : (
        <CollapsibleProjectList ws={ws} projects={projects} completion={completion} />
      )}
    </div>
  );
}
