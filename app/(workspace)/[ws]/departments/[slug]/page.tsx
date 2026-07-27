import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressRing } from "@/components/primitives/progress";
import { Breadcrumbs, CodeLabel, CountBadge } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProjectBoard } from "@/components/features/projects/project-board";
import {
  NewListForm,
  DeleteListButton,
} from "@/components/features/departments/department-controls";
import type { Department, ProjectList } from "@/lib/types";
import type {
  CompletionMap,
  ProjectWithOwner,
} from "@/components/features/projects/types";

export const metadata: Metadata = { title: "Department" };

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { ws, slug } = await params;
  const sp = await searchParams;
  // List stays the default, so an existing link to a space is unchanged.
  const view = sp.view === "board" ? "board" : "list";
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

  const [{ data: listRows }, { data: projectRows }, { data: taskRows }] =
    await Promise.all([
      supabase
        .from("project_lists")
        .select("*")
        .eq("department_id", dept.id)
        .order("sort_order"),
      supabase
        .from("projects")
        .select("*, owner:profiles(id, full_name, avatar_url)")
        .eq("department_id", dept.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("project_id, status, project:projects!inner(department_id)")
        .eq("project.department_id", dept.id),
    ]);

  const lists = (listRows ?? []) as ProjectList[];
  const projects = (projectRows ?? []) as unknown as ProjectWithOwner[];
  // Shaped as CompletionMap so the list sections and the board read the same
  // counts from one source.
  const completion: CompletionMap = {};
  for (const t of (taskRows ?? []) as { project_id: string; status: string }[]) {
    const c = (completion[t.project_id] ??= { done: 0, total: 0 });
    c.total += 1;
    if (t.status === "done") c.done += 1;
  }

  const canManage = ctx.capabilities.canCreateProjects;
  const canAddList = ctx.capabilities.canAssignTasks;
  const unlisted = projects.filter((p) => !p.list_id);

  const base = `/${ws}/departments/${slug}`;
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

  const ProjectRow = (p: ProjectWithOwner) => {
    const c = completion[p.id] ?? { done: 0, total: 0 };
    return (
      <ListRow
        key={p.id}
        leading={<ProgressRing value={c.total > 0 ? c.done / c.total : 0} size={32} />}
        title={
          <Link href={`/${ws}/projects/${p.id}`} className="hover:underline">
            {p.title}
          </Link>
        }
        subtitle={<CodeLabel code={p.code} />}
        meta={
          <>
            {p.owner ? (
              <PersonAvatar name={p.owner.full_name} src={p.owner.avatar_url} size={22} />
            ) : null}
            {p.due_date ? (
              <span className="font-mono text-[12px] text-text-2 tabular">
                {fmtDate(p.due_date)}
              </span>
            ) : null}
            <ProjectStatusChip status={p.status} />
          </>
        }
        trailing={
          <Link
            href={`/${ws}/projects/${p.id}`}
            className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
          >
            Open
          </Link>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: `/${ws}/departments` },
          { label: dept.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-[11px] text-[15px] font-semibold"
            style={{ backgroundColor: `${dept.accent_color}1A`, color: dept.accent_color }}
          >
            {dept.name.slice(0, 1)}
          </span>
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
              {dept.name}
            </h1>
            <p className="mt-0.5 text-sm text-text-2">
              {projects.length} project{projects.length === 1 ? "" : "s"} across{" "}
              {lists.length} list{lists.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
            {tab("list", "List")}
            {tab("board", "Board")}
          </div>
          {canAddList ? <NewListForm ws={ws} departmentId={dept.id} slug={slug} /> : null}
          {canManage ? (
            <Button asChild>
              <Link href={`/${ws}/projects/new?department=${dept.id}`}>
                <Plus />
                New project
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {lists.length === 0 && projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title="This department is empty. Add a list to organize work, or start a project."
            action={
              canManage ? (
                <Button asChild>
                  <Link href={`/${ws}/projects/new?department=${dept.id}`}>
                    New project
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "board" ? (
        // The board groups every project in the space by status, so it cuts
        // across the lists rather than nesting inside them.
        <ProjectBoard ws={ws} projects={projects} completion={completion} />
      ) : (
        <div className="flex flex-col gap-5">
          {lists.map((l) => {
            const items = projects.filter((p) => p.list_id === l.id);
            return (
              <section key={l.id} id={`list-${l.id}`} className="scroll-mt-6">
                <div className="group/list flex items-center gap-2 px-1 pb-1">
                  <span className="group-label">{l.name}</span>
                  <CountBadge count={items.length} className="ml-0" />
                  <div className="ml-auto flex items-center gap-1">
                    {canManage ? (
                      <Link
                        href={`/${ws}/projects/new?department=${dept.id}&list=${l.id}`}
                        className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover/list:opacity-100"
                      >
                        New project
                      </Link>
                    ) : null}
                    {canAddList ? (
                      <DeleteListButton ws={ws} listId={l.id} slug={slug} />
                    ) : null}
                  </div>
                </div>
                <Card>
                  {items.length === 0 ? (
                    <p className="px-5 py-4 text-[12.5px] text-text-3">
                      Nothing in this list yet.
                    </p>
                  ) : (
                    items.map((p) => ProjectRow(p))
                  )}
                </Card>
              </section>
            );
          })}

          {unlisted.length > 0 ? (
            <section>
              <div className="flex items-center gap-2 px-1 pb-1">
                <span className="group-label">
                  {lists.length > 0 ? "Unlisted" : "Projects"}
                </span>
                <CountBadge count={unlisted.length} className="ml-0" />
              </div>
              <Card>{unlisted.map((p) => ProjectRow(p))}</Card>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
