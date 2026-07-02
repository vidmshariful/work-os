import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ListChecks, Plus, SquareCheckBig } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardHeader } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import {
  ProjectStatusChip,
  TaskStatusChip,
  ConfidentialChip,
  Tag,
} from "@/components/primitives/tag";
import { PersonAvatar, AvatarStack } from "@/components/primitives/avatar";
import { ProgressBar } from "@/components/primitives/progress";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { RightRailPanel } from "@/components/primitives/right-rail";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateFull, daysUntil } from "@/lib/format";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { ProjectStatusSelect } from "@/components/features/projects/status-select";
import { DeliverableToggle } from "@/components/features/projects/deliverable-toggle";
import { ProjectFiles } from "@/components/features/projects/project-files";
import { listProjectFiles } from "@/lib/actions/projects";
import type {
  ProjectWithOwner,
  TaskWithAssignee,
} from "@/components/features/projects/types";
import type { Deliverable, ProjectPhase, VClient } from "@/lib/types";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: projectRow } = await supabase
    .from("projects")
    .select("*, owner:profiles(id, full_name, avatar_url)")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!projectRow) notFound();
  const project = projectRow as unknown as ProjectWithOwner;

  const [
    { data: phaseRows },
    { data: taskRows },
    { data: deliverableRows },
    clientRes,
    files,
  ] = await Promise.all([
    supabase
      .from("project_phases")
      .select("*")
      .eq("project_id", id)
      .order("sort_order"),
    supabase
      .from("tasks")
      .select("*, assignee:profiles(id, full_name, avatar_url)")
      .eq("project_id", id)
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("deliverables")
      .select("*")
      .eq("project_id", id)
      .order("sort_order"),
    project.client_id
      ? supabase.from("v_clients").select("*").eq("id", project.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listProjectFiles(ws, id),
  ]);

  const phases = (phaseRows ?? []) as ProjectPhase[];
  const tasks = (taskRows ?? []) as unknown as TaskWithAssignee[];
  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const client = (clientRes.data ?? null) as VClient | null;

  const done = tasks.filter((t) => t.status === "done").length;
  const fraction = tasks.length > 0 ? done / tasks.length : 0;
  const assignees = Array.from(
    new Map(
      tasks
        .filter((t) => t.assignee)
        .map((t) => [t.assignee!.id, t.assignee!])
    ).values()
  );
  const canManage =
    ctx.capabilities.canCreateProjects || project.owner_id === ctx.userId;
  const remaining = daysUntil(project.due_date);

  const taskGroups: { key: string; name: string; tasks: TaskWithAssignee[] }[] =
    phases.map((p) => ({
      key: p.id,
      name: p.name,
      tasks: tasks.filter((t) => t.phase_id === p.id),
    }));
  const unphased = tasks.filter((t) => !t.phase_id);
  if (unphased.length > 0) {
    taskGroups.push({ key: "general", name: "General", tasks: unphased });
  }

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Projects", href: `/${ws}/projects` },
          { label: project.code },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeLabel code={project.code} className="text-[13px]" />
            <ProjectStatusChip status={project.status} />
            {client && isUnmasked(client) && isConfidential(client) ? (
              <ConfidentialChip />
            ) : null}
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-text-1">
            {project.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2">
            {client ? (
              <Link
                href={`/${ws}/clients/${client.id}`}
                className="font-medium text-text-1 hover:text-brand"
              >
                {clientLabel(client)}
              </Link>
            ) : null}
            {project.type ? <span>{project.type}</span> : null}
            {project.owner ? (
              <span className="flex items-center gap-1.5">
                <PersonAvatar
                  name={project.owner.full_name}
                  src={project.owner.avatar_url}
                  size={20}
                />
                {project.owner.full_name}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ctx.capabilities.canAssignTasks ? (
            <Button variant="outline" asChild>
              <Link href={`/${ws}/tasks/new?project=${id}`}>
                <Plus />
                Add task
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <ProjectStatusSelect ws={ws} projectId={id} status={project.status} />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between text-[12.5px] font-medium text-text-2">
              <span>
                {done} of {tasks.length} tasks done
              </span>
              <span className="font-mono tabular">{Math.round(fraction * 100)}%</span>
            </div>
            <ProgressBar value={fraction} className="mt-2" />
          </Card>

          {taskGroups.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SquareCheckBig />}
                title="No tasks yet. Add the first one to get moving."
                action={
                  ctx.capabilities.canAssignTasks ? (
                    <Button asChild>
                      <Link href={`/${ws}/tasks/new?project=${id}`}>Add task</Link>
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            taskGroups.map((group) => (
              <Card key={group.key}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {group.name}
                      <span className="font-mono text-[12px] font-medium text-text-3 tabular">
                        {group.tasks.filter((t) => t.status === "done").length}/
                        {group.tasks.length}
                      </span>
                    </span>
                  }
                />
                {group.tasks.length === 0 ? (
                  <p className="px-5 pb-4 text-[12.5px] text-text-3">
                    Nothing in this phase yet.
                  </p>
                ) : (
                  group.tasks.map((t) => (
                    <ListRow
                      key={t.id}
                      title={t.title}
                      subtitle={
                        t.revision_count > 0 ? (
                          <span className="font-mono text-[11.5px] tabular">
                            {t.revision_count} revision{t.revision_count === 1 ? "" : "s"}
                          </span>
                        ) : undefined
                      }
                      meta={
                        <>
                          {t.priority > 0 ? (
                            <Tag tone={t.priority > 1 ? "rose" : "violet"}>
                              {t.priority > 1 ? "Urgent" : "High"}
                            </Tag>
                          ) : null}
                          {t.assignee ? (
                            <PersonAvatar
                              name={t.assignee.full_name}
                              src={t.assignee.avatar_url}
                              size={22}
                            />
                          ) : null}
                          {t.due_date ? (
                            <span className="font-mono text-[12px] text-text-2 tabular">
                              {fmtDate(t.due_date)}
                            </span>
                          ) : null}
                          <TaskStatusChip status={t.status} />
                        </>
                      }
                      trailing={
                        <Link
                          href={`/${ws}/tasks/${t.id}`}
                          className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                        >
                          Open
                        </Link>
                      }
                    />
                  ))
                )}
              </Card>
            ))
          )}

          <Card>
            <CardHeader title="Deliverables" />
            {deliverables.length === 0 ? (
              <EmptyState
                icon={<ListChecks />}
                title="No deliverables listed for this project."
              />
            ) : (
              <div>
                {deliverables.map((d) => (
                  <DeliverableToggle
                    key={d.id}
                    ws={ws}
                    projectId={id}
                    deliverable={d}
                    canToggle={ctx.capabilities.canAssignTasks}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <RightRailPanel title="Assigned people">
            {assignees.length === 0 ? (
              <p className="py-2 text-center text-[12.5px] text-text-3">
                Nobody assigned yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                <AvatarStack
                  people={assignees.map((a) => ({
                    name: a.full_name,
                    src: a.avatar_url,
                  }))}
                  size={30}
                />
                {assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <PersonAvatar name={a.full_name} src={a.avatar_url} size={22} />
                    <span className="text-[12.5px] text-text-1">{a.full_name}</span>
                  </div>
                ))}
              </div>
            )}
          </RightRailPanel>

          <RightRailPanel title="Timeline">
            <div className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-text-2">Created</span>
                <span className="font-mono text-text-1 tabular">
                  {fmtDateFull(project.created_at)}
                </span>
              </div>
              {project.start_date ? (
                <div className="flex items-center justify-between">
                  <span className="text-text-2">Start</span>
                  <span className="font-mono text-text-1 tabular">
                    {fmtDateFull(project.start_date)}
                  </span>
                </div>
              ) : null}
              {project.due_date ? (
                <div className="flex items-center justify-between">
                  <span className="text-text-2">Due</span>
                  <span className="font-mono text-text-1 tabular">
                    {fmtDateFull(project.due_date)}
                  </span>
                </div>
              ) : null}
              {remaining !== null ? (
                <div className="mt-1 flex items-center gap-1.5 rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-text-2">
                  <CalendarDays className="size-3.5" strokeWidth={1.5} />
                  {remaining >= 0
                    ? `${remaining} day${remaining === 1 ? "" : "s"} remaining`
                    : `${Math.abs(remaining)} day${remaining === -1 ? "" : "s"} overdue`}
                </div>
              ) : null}
            </div>
          </RightRailPanel>

          <RightRailPanel title="Files">
            <ProjectFiles
              ws={ws}
              projectId={id}
              files={files}
              canDelete={ctx.capabilities.canCreateProjects}
            />
          </RightRailPanel>
        </div>
      </div>
    </div>
  );
}
