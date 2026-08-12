import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadCardFields } from "@/lib/data/spaces";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectBoard } from "@/components/features/projects/project-board";
import { ProjectCalendar } from "@/components/features/departments/project-calendar";
import { StatusGroupedList } from "@/components/features/departments/status-grouped-list";
import { ProjectActionsProvider } from "@/components/features/projects/project-actions";
import type { Department, ProjectList } from "@/lib/types";
import { completionFrom } from "@/components/features/projects/types";
import type {
  MemberOption,
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

  const [
    { data: projectRows },
    { data: progressRows },
    { data: listRows },
    { data: memberRows },
    { data: spaceRows },
    cardFields,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*, owner:profiles(id, full_name, avatar_url)")
      .eq("department_id", dept.id)
      .eq("list_id", listId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    // Rolled-up progress from the view. A parent in this list counts its
    // sub-projects even when they sit in another list.
    supabase.from("v_project_progress").select("*"),
    // Destinations for the row menu. Lists are the sibling lists of this
    // space; spaces come back already filtered by departments_select.
    supabase
      .from("project_lists")
      .select("id, name")
      .eq("department_id", dept.id)
      .order("sort_order"),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    supabase
      .from("departments")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id)
      .order("name"),
    // Same chips the space board draws. A list is a slice of that board, so
    // it cannot be the surface where the stages disappear.
    loadCardFields(supabase, ctx.workspace.id, dept.id),
  ]);

  const projects = (projectRows ?? []) as unknown as ProjectWithOwner[];
  const completion = completionFrom(progressRows);
  const canManage = ctx.capabilities.canCreateProjects;
  const actionScope = {
    ws,
    viewerId: ctx.userId,
    canManage,
    canDelete: ctx.capabilities.canDeleteProjects,
    lists: (listRows ?? []) as { id: string; name: string }[],
    spaces: (spaceRows ?? []) as { id: string; name: string }[],
    members: ((memberRows ?? []) as unknown as { profile: MemberOption }[])
      .map((m) => m.profile)
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  };

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

      <ProjectActionsProvider scope={actionScope} rows={projects}>
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
        <ProjectBoard
          ws={ws}
          projects={projects}
          completion={completion}
          fields={cardFields.fields}
          fieldValues={cardFields.values}
        />
      ) : view === "calendar" ? (
        <ProjectCalendar ws={ws} base={`${base}?view=calendar`} month={month} projects={projects} />
      ) : (
        <StatusGroupedList
          ws={ws}
          slug={slug}
          userId={ctx.userId}
          departmentId={dept.id}
          listId={listId}
          listName={list.name}
          projects={projects}
          completion={completion}
          canManage={canManage}
        />
      )}
      </ProjectActionsProvider>
    </div>
  );
}
