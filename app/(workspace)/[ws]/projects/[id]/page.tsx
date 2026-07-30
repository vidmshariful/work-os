import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Layers,
  ListChecks,
  MessageSquare,
  Plus,
  SquareCheckBig,
} from "lucide-react";
import { SubProjectAdd } from "@/components/features/projects/sub-projects";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
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
import { fmtDate, fmtDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dueState } from "@/components/features/projects/due-date";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { ProjectStatusSelect } from "@/components/features/projects/status-select";
import { DeliverableToggle } from "@/components/features/projects/deliverable-toggle";
import { ProjectFiles } from "@/components/features/projects/project-files";
import {
  EditProjectDialog,
  ProjectBrief,
} from "@/components/features/projects/project-edit";
import type { ActivityItem } from "@/components/features/activity/activity-panel";
import {
  ProjectIntakePanel,
  IntakeStatusTag,
} from "@/components/features/clients/project-intake-panel";
import { CommercialsPanel } from "@/components/features/clients/commercials-card";
import {
  ActivityFeed,
  type FeedComment,
} from "@/components/features/activity/activity-feed";
import { ProjectCommentForm } from "@/components/features/projects/project-comments";
import { listProjectFiles } from "@/lib/actions/projects";
import type {
  ProgressRow,
  ProjectWithOwner,
  TaskWithAssignee,
} from "@/components/features/projects/types";
import type {
  Deliverable,
  ProjectCommercials,
  ProjectIntake,
  ProjectPhase,
  VClient,
} from "@/lib/types";

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
    intakeRes,
    commercialsRes,
    { data: memberRows },
    { data: activityRows },
    { data: deptRows },
    { data: listRows },
    { data: subProjectRows },
    parentRes,
    { data: commentRows },
    progressRes,
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
    // Both are RLS-gated: intake to above-wall members, commercials to
    // executives and the assigned manager. Everyone else gets null.
    supabase.from("project_intakes").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("project_commercials").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    supabase
      .from("activity_log")
      .select("id, verb, detail, created_at, actor:profiles!actor_id(full_name, avatar_url)")
      .eq("entity_type", "project")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("departments")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id)
      .order("sort_order"),
    supabase.from("project_lists").select("id, name, department_id").order("sort_order"),
    // The family: for a parent, its sub-projects; for a sub-project, its
    // siblings (so any video shows the rest of its series).
    supabase
      .from("projects")
      .select("*, owner:profiles(id, full_name, avatar_url)")
      .eq("parent_project_id", project.parent_project_id ?? id)
      .order("created_at"),
    project.parent_project_id
      ? supabase.from("projects").select("id, code, title").eq("id", project.parent_project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Oldest first, so the thread reads top to bottom like a conversation.
    supabase
      .from("project_comments")
      .select("id, body, created_at, author:profiles!author_id(id, full_name, avatar_url)")
      .eq("project_id", id)
      .order("created_at"),
    // Direct and rolled-up counts, computed in the database.
    supabase.from("v_project_progress").select("*").eq("project_id", id).maybeSingle(),
  ]);

  const phases = (phaseRows ?? []) as ProjectPhase[];
  const tasks = (taskRows ?? []) as unknown as TaskWithAssignee[];
  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const client = (clientRes.data ?? null) as VClient | null;
  const intake = (intakeRes.data ?? null) as ProjectIntake | null;
  const commercials = (commercialsRes.data ?? null) as ProjectCommercials | null;
  const comments = (commentRows ?? []) as unknown as FeedComment[];
  const canEditCommercials =
    ctx.membership.archetype === "executive" ||
    (project.owner_id === ctx.userId && ctx.aboveWall);

  // Progress comes from v_project_progress, the same view every list, board,
  // and ring reads, so this page cannot drift from them. A project with
  // sub-projects reports the rolled-up figure; a leaf reports its own tasks,
  // because there the rollup equals the direct count.
  const progress = (progressRes.data ?? null) as ProgressRow | null;
  const directDone = progress?.direct_done ?? 0;
  const directTotal = progress?.direct_total ?? 0;
  const childCount = progress?.child_count ?? 0;
  const done = progress?.rollup_done ?? 0;
  const total = progress?.rollup_total ?? 0;
  const fraction = total > 0 ? done / total : 0;
  const assignees = Array.from(
    new Map(
      tasks
        .filter((t) => t.assignee)
        .map((t) => [t.assignee!.id, t.assignee!])
    ).values()
  );
  const canManage =
    ctx.capabilities.canCreateProjects || project.owner_id === ctx.userId;
  const members = ((memberRows ?? []) as unknown as {
    profile: { id: string; full_name: string };
  }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const activity = (activityRows ?? []) as unknown as ActivityItem[];
  const deptLists = (listRows ?? []) as {
    id: string;
    name: string;
    department_id: string;
  }[];
  const departments = ((deptRows ?? []) as { id: string; name: string }[]).map(
    (d) => ({
      id: d.id,
      name: d.name,
      lists: deptLists
        .filter((l) => l.department_id === d.id)
        .map((l) => ({ id: l.id, name: l.name })),
    })
  );
  // One source for how this project's due date reads, shared with every row
  // and board card through the same helper.
  const due = dueState(project.due_date, project.status);
  const subProjects = (subProjectRows ?? []) as unknown as ProjectWithOwner[];
  const parentProject = (parentRes?.data ?? null) as {
    id: string;
    code: string;
    title: string;
  } | null;
  const isSub = project.parent_project_id !== null;

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
          {parentProject ? (
            <Link
              href={`/${ws}/projects/${parentProject.id}`}
              className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-brand"
            >
              <Layers className="size-3.5" strokeWidth={1.5} />
              Part of {parentProject.title}
            </Link>
          ) : null}
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
          {canManage ? (
            <EditProjectDialog
              ws={ws}
              project={project}
              members={members}
              departments={departments}
            />
          ) : null}
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

      {/* The rail carries the activity and comment thread, so it needs a
          little more room than a plain meta column would. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {canManage || project.brief ? (
            <Card>
              <CardHeader title="Brief" />
              <CardBody>
                <ProjectBrief
                  ws={ws}
                  projectId={id}
                  brief={project.brief}
                  canEdit={canManage}
                />
              </CardBody>
            </Card>
          ) : null}

          {subProjects.length > 0 || (!isSub && canManage) ? (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Layers className="size-4 text-text-3" strokeWidth={1.5} />
                    Sub-projects
                    {subProjects.length > 0 ? (
                      <span className="font-mono text-[12px] font-medium text-text-3 tabular">
                        {subProjects.length}
                      </span>
                    ) : null}
                  </span>
                }
                action={
                  canManage && !isSub ? (
                    <SubProjectAdd ws={ws} parentId={id} members={members} />
                  ) : undefined
                }
              />
              {subProjects.length === 0 ? (
                <p className="px-5 pb-4 text-[12.5px] text-text-3">
                  No sub-projects yet. Add one for each piece of a bulk order.
                </p>
              ) : (
                subProjects.map((sp) => {
                  const current = sp.id === id;
                  return (
                    <ListRow
                      key={sp.id}
                      className={current ? "bg-accent-soft/50" : undefined}
                      title={
                        current ? (
                          <span className="font-semibold text-text-1">{sp.title}</span>
                        ) : (
                          <Link href={`/${ws}/projects/${sp.id}`} className="hover:underline">
                            {sp.title}
                          </Link>
                        )
                      }
                      subtitle={
                        <span className="flex items-center gap-2">
                          <CodeLabel code={sp.code} />
                          {current ? (
                            <span className="font-medium text-brand">This project</span>
                          ) : null}
                        </span>
                      }
                      meta={
                        <>
                          {sp.owner ? (
                            <PersonAvatar
                              name={sp.owner.full_name}
                              src={sp.owner.avatar_url}
                              size={22}
                            />
                          ) : null}
                          {sp.due_date ? (
                            <span className="font-mono text-[12px] text-text-2 tabular">
                              {fmtDate(sp.due_date)}
                            </span>
                          ) : null}
                          <ProjectStatusChip status={sp.status} />
                        </>
                      }
                      trailing={
                        current ? null : (
                          <Link
                            href={`/${ws}/projects/${sp.id}`}
                            className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                          >
                            Open
                          </Link>
                        )
                      }
                    />
                  );
                })
              )}
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="flex items-center justify-between text-[12.5px] font-medium text-text-2">
              <span>
                {done} of {total} tasks done
              </span>
              <span className="font-mono tabular">{Math.round(fraction * 100)}%</span>
            </div>
            <ProgressBar value={fraction} className="mt-2" />
            {childCount > 0 ? (
              <p className="mt-2 text-[11.5px] text-text-3">
                Includes {childCount} sub-project{childCount === 1 ? "" : "s"}.{" "}
                {directDone} of {directTotal} sit on this project directly.
              </p>
            ) : null}
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
          {intake ? (
            <RightRailPanel
              title="Intake"
              action={<IntakeStatusTag status={intake.status} />}
            >
              <ProjectIntakePanel
                ws={ws}
                projectId={id}
                clientId={project.client_id}
                intake={intake}
              />
            </RightRailPanel>
          ) : null}

          {commercials || canEditCommercials ? (
            <RightRailPanel title="Commercials">
              <CommercialsPanel
                ws={ws}
                projectId={id}
                clientId={project.client_id}
                commercials={commercials}
                canEdit={canEditCommercials}
              />
            </RightRailPanel>
          ) : null}

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
                  <span
                    className={cn(
                      "font-mono tabular",
                      due?.tone === "overdue"
                        ? "font-medium text-danger"
                        : due?.tone === "soon"
                          ? "font-medium text-warning"
                          : "text-text-1"
                    )}
                  >
                    {fmtDateFull(project.due_date)}
                  </span>
                </div>
              ) : null}
              {due ? (
                <div
                  className={cn(
                    "mt-1 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5",
                    due.tone === "overdue"
                      ? "bg-danger-soft font-medium text-danger"
                      : due.tone === "soon"
                        ? "bg-warning-soft font-medium text-warning"
                        : "bg-surface-2 text-text-2"
                  )}
                >
                  <CalendarDays className="size-3.5" strokeWidth={1.5} />
                  {due.tone !== "neutral"
                    ? due.label
                    : due.days >= 0
                      ? `${due.days} day${due.days === 1 ? "" : "s"} remaining`
                      : // A delivered project past its date is not late, so
                        // this states the fact without urgency.
                        "Due date passed"}
                </div>
              ) : null}
            </div>
          </RightRailPanel>

          <RightRailPanel
            title="Activity"
            action={
              <span className="flex items-center gap-1 text-[11.5px] text-text-3">
                <MessageSquare className="size-3.5" strokeWidth={1.5} />
                {comments.length}
              </span>
            }
          >
            <ActivityFeed
              activity={activity}
              comments={comments}
              composer={<ProjectCommentForm ws={ws} projectId={id} />}
            />
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
