import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressRing } from "@/components/primitives/progress";
import { CodeLabel } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/features/projects/view-toggle";
import { ProjectFilters } from "@/components/features/projects/project-filters";
import { ProjectBoard } from "@/components/features/projects/project-board";
import { loadCardFields } from "@/lib/data/spaces";
import { DueDate } from "@/components/features/projects/due-date";
import { ProjectRowActions } from "@/components/features/projects/project-row-actions";
import { completionFrom } from "@/components/features/projects/types";
import type {
  MemberOption,
  ProjectWithOwner,
} from "@/components/features/projects/types";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ view?: string; status?: string; owner?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "list";
  const status = sp.status ?? "";
  const owner = sp.owner ?? "";

  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("*, owner:profiles!projects_owner_id_fkey(id, full_name, avatar_url)")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false });
  // Archived projects stay out of the default view. They appear only when
  // explicitly filtered to Archived, where the Restore action lives.
  if (status) query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (owner) query = query.eq("owner_id", owner);

  const [{ data: projectRows }, { data: progressRows }, { data: memberRows }, cardFields] =
    await Promise.all([
      query,
      // Rolled-up progress from the view, so a parent row reflects its
      // sub-projects rather than only its own tasks.
      supabase.from("v_project_progress").select("*"),
      supabase
        .from("memberships")
        .select("profile:profiles!profile_id!inner(id, full_name)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      // This page spans spaces, so only the workspace-wide fields apply.
      loadCardFields(supabase, ctx.workspace.id, null),
    ]);

  const projects = (projectRows ?? []) as unknown as ProjectWithOwner[];
  const completion = completionFrom(progressRows);
  const members = ((memberRows ?? []) as unknown as {
    profile: MemberOption;
  }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
            Projects
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Every engagement in flight, by list or by board.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectFilters
            ws={ws}
            view={view}
            status={status}
            owner={owner}
            members={members}
          />
          <ViewToggle ws={ws} view={view} status={status} owner={owner} />
          {ctx.capabilities.canCreateProjects ? (
            <Button asChild>
              <Link href={`/${ws}/projects/new`}>
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
            title="No projects match. Clear the filters or start a new one."
            action={
              ctx.capabilities.canCreateProjects ? (
                <Button asChild>
                  <Link href={`/${ws}/projects/new`}>New project</Link>
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
      ) : (
        <Card>
          {projects.map((p) => {
            const c = completion[p.id] ?? { done: 0, total: 0 };
            return (
              <ListRow
                key={p.id}
                leading={
                  <ProgressRing value={c.total > 0 ? c.done / c.total : 0} size={34} />
                }
                title={p.title}
                subtitle={
                  <span className="flex items-center gap-2">
                    <CodeLabel code={p.code} />
                    {p.type ? <span>{p.type}</span> : null}
                  </span>
                }
                meta={
                  <>
                    {p.owner ? (
                      <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
                        <PersonAvatar
                          name={p.owner.full_name}
                          src={p.owner.avatar_url}
                          size={22}
                        />
                        <span className="hidden lg:inline">{p.owner.full_name}</span>
                      </span>
                    ) : null}
                    <DueDate due={p.due_date} status={p.status} />
                    <ProjectStatusChip status={p.status} />
                  </>
                }
                trailing={
                  <ProjectRowActions
                    ws={ws}
                    projectId={p.id}
                    canArchive={ctx.capabilities.canCreateProjects}
                    isArchived={p.status === "archived"}
                  />
                }
              />
            );
          })}
        </Card>
      )}
    </div>
  );
}
