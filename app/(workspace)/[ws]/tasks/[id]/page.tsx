import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitBranch, History, ListTree, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { TaskStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { TimeAgo } from "@/components/primitives/local-time";
import { TaskStatusSelect } from "@/components/features/tasks/task-status-select";
import {
  PriorityTag,
  DueDateLabel,
} from "@/components/features/tasks/task-bits";
import {
  AssigneeSelect,
  CommentForm,
  DependencyManager,
  DeleteTaskButton,
  EditableDescription,
  EditableTitle,
  PhaseSelect,
  RemoveDependencyButton,
  RevisionForm,
} from "@/components/features/tasks/detail-forms";
import type { ActivityItem } from "@/components/features/activity/activity-panel";
import {
  ActivityFeed,
  type FeedComment,
} from "@/components/features/activity/activity-feed";
import {
  SubtasksCard,
  type SubtaskRow,
} from "@/components/features/tasks/subtasks";
import type { Task, TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Task" };

interface PersonRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: taskRow } = await supabase
    .from("tasks")
    .select(
      "*, assignee:profiles(id, full_name, avatar_url), project:projects!inner(id, code, title, workspace_id), phase:project_phases(id, name)"
    )
    .eq("id", id)
    .eq("project.workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!taskRow) notFound();

  const task = taskRow as unknown as Task & {
    assignee: PersonRef | null;
    project: { id: string; code: string; title: string };
    phase: { id: string; name: string } | null;
  };

  const [
    { data: commentRows },
    { data: revisions },
    { data: depRows },
    { data: projectTasks },
    { data: memberRows },
    { data: phaseRows },
    { data: activityRows },
    { data: subtaskRows },
    parentRes,
  ] = await Promise.all([
    supabase
      .from("task_comments")
      .select("*, author:profiles(id, full_name, avatar_url)")
      .eq("task_id", id)
      .order("created_at"),
    supabase
      .from("task_revisions")
      .select("*, requester:profiles(id, full_name, avatar_url)")
      .eq("task_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("task_dependencies")
      .select("depends_on_task_id, depends_on:tasks!task_dependencies_depends_on_task_id_fkey(id, title, status)")
      .eq("task_id", id),
    supabase
      .from("tasks")
      .select("id, title")
      .eq("project_id", task.project.id)
      .neq("id", id)
      .order("created_at"),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    supabase
      .from("project_phases")
      .select("id, name")
      .eq("project_id", task.project.id)
      .order("sort_order"),
    supabase
      .from("activity_log")
      .select("id, verb, detail, created_at, actor:profiles!actor_id(full_name, avatar_url)")
      .eq("entity_type", "task")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("tasks")
      .select("id, title, status")
      .eq("parent_task_id", id)
      .order("created_at"),
    task.parent_task_id
      ? supabase.from("tasks").select("id, title").eq("id", task.parent_task_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const deps = ((depRows ?? []) as unknown as {
    depends_on_task_id: string;
    depends_on: { id: string; title: string; status: TaskStatus } | null;
  }[]).filter((d) => d.depends_on);
  const waiting = deps.some((d) => d.depends_on!.status !== "done");
  const canManage = ctx.capabilities.canAssignTasks;
  const isMine = task.assignee_id === ctx.userId;
  const members = ((memberRows ?? []) as unknown as { profile: { id: string; full_name: string } }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const phases = (phaseRows ?? []) as { id: string; name: string }[];
  const activity = (activityRows ?? []) as unknown as ActivityItem[];
  const comments = (commentRows ?? []) as unknown as FeedComment[];
  const subtasks = (subtaskRows ?? []) as unknown as SubtaskRow[];
  const parentTask = (parentRes?.data ?? null) as { id: string; title: string } | null;
  const isSubtask = task.parent_task_id !== null;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Projects", href: `/${ws}/projects` },
          { label: task.project.code, href: `/${ws}/projects/${task.project.id}` },
          { label: "Task" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeLabel code={task.project.code} className="text-body" />
            <TaskStatusChip status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.phase ? (
              <span className="text-meta text-text-3">{task.phase.name}</span>
            ) : null}
          </div>
          {isSubtask && parentTask ? (
            <Link
              href={`/${ws}/tasks/${parentTask.id}`}
              className="mt-1 flex items-center gap-1.5 text-meta text-text-2 hover:text-brand"
            >
              <ListTree className="size-3.5" strokeWidth={1.5} />
              Part of {parentTask.title}
            </Link>
          ) : null}
          <EditableTitle ws={ws} taskId={id} title={task.title} canEdit={canManage} />
        </div>
        <div className="flex items-center gap-2">
          {isMine || canManage ? (
            <TaskStatusSelect ws={ws} taskId={id} status={task.status} />
          ) : null}
          {canManage ? (
            <DeleteTaskButton ws={ws} taskId={id} projectId={task.project.id} />
          ) : null}
        </div>
      </div>

      {/* The rail carries the activity and comment thread, so it needs a
          little more room than a plain meta column would. */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Description" />
            <CardBody>
              <EditableDescription
                ws={ws}
                taskId={id}
                description={task.description}
                canEdit={canManage || isMine}
              />
            </CardBody>
          </Card>

          {!isSubtask && (subtasks.length > 0 || canManage) ? (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <ListTree className="size-4 text-text-3" strokeWidth={1.5} />
                    Subtasks
                    {subtasks.length > 0 ? (
                      <span className="font-mono text-meta font-medium text-text-3 tabular">
                        {subtasks.filter((s) => s.status === "done").length}/
                        {subtasks.length}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <CardBody>
                <SubtasksCard
                  ws={ws}
                  parentId={id}
                  subtasks={subtasks}
                  parentStatus={task.status}
                  canManage={canManage}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <History className="size-4 text-text-3" strokeWidth={1.5} />
                  Revisions
                  <span className="font-mono text-meta font-medium text-text-3 tabular">
                    {task.revision_count}
                  </span>
                </span>
              }
              action={<RevisionForm ws={ws} taskId={id} />}
            />
            <CardBody className="flex flex-col gap-3">
              {(revisions ?? []).length === 0 ? (
                <p className="text-body text-text-3">
                  No revisions logged. That is a good sign.
                </p>
              ) : (
                (revisions ?? []).map((r) => {
                  const rev = r as unknown as {
                    id: string;
                    note: string | null;
                    created_at: string;
                    requester: PersonRef | null;
                  };
                  return (
                    <div key={rev.id} className="flex gap-2.5">
                      <PersonAvatar
                        name={rev.requester?.full_name}
                        src={rev.requester?.avatar_url}
                        size={26}
                      />
                      <div className="min-w-0">
                        <p className="text-meta">
                          <span className="font-medium text-text-1">
                            {rev.requester?.full_name ?? "Someone"}
                          </span>{" "}
                          <span className="text-text-3"><TimeAgo at={rev.created_at} /></span>
                        </p>
                        {rev.note ? (
                          <p className="mt-0.5 text-body text-text-2">{rev.note}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h4 className="text-body font-semibold text-text-1">Details</h4>
            <div className="mt-3 flex flex-col gap-2.5 text-meta">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-2">Assignee</span>
                {canManage ? (
                  <AssigneeSelect
                    ws={ws}
                    taskId={id}
                    assigneeId={task.assignee_id}
                    members={members}
                  />
                ) : task.assignee ? (
                  <span className="flex items-center gap-1.5 text-text-1">
                    <PersonAvatar
                      name={task.assignee.full_name}
                      src={task.assignee.avatar_url}
                      size={20}
                    />
                    {task.assignee.full_name}
                  </span>
                ) : (
                  <span className="text-text-3">Unassigned</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-2">Phase</span>
                {canManage && phases.length > 0 ? (
                  <PhaseSelect
                    ws={ws}
                    taskId={id}
                    phaseId={task.phase_id}
                    phases={phases}
                  />
                ) : (
                  <span className="text-text-1">{task.phase?.name ?? "No phase"}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Due</span>
                {task.due_date ? (
                  <DueDateLabel date={task.due_date} status={task.status} />
                ) : (
                  <span className="text-text-3">Not set</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Project</span>
                <Link
                  href={`/${ws}/projects/${task.project.id}`}
                  className="max-w-[170px] truncate font-medium text-text-1 hover:text-brand"
                >
                  {task.project.title}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Created</span>
                <span className="text-text-1"><TimeAgo at={task.created_at} /></span>
              </div>
              {task.completed_at ? (
                <div className="flex items-center justify-between">
                  <span className="text-text-2">Completed</span>
                  <span className="text-text-1"><TimeAgo at={task.completed_at} /></span>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="flex items-center gap-2 text-body font-semibold text-text-1">
              <GitBranch className="size-4 text-text-3" strokeWidth={1.5} />
              Dependencies
            </h4>
            <div className="mt-3 flex flex-col gap-2">
              {deps.length === 0 ? (
                <p className="text-meta text-text-3">No dependencies.</p>
              ) : (
                deps.map((d) => (
                  <div
                    key={d.depends_on_task_id}
                    className="group flex items-center gap-2 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-surface-2"
                  >
                    <Link
                      href={`/${ws}/tasks/${d.depends_on!.id}`}
                      className="min-w-0 flex-1 truncate text-meta font-medium text-text-1 hover:text-brand"
                    >
                      {d.depends_on!.title}
                    </Link>
                    <TaskStatusChip status={d.depends_on!.status} />
                    {canManage ? (
                      <RemoveDependencyButton
                        ws={ws}
                        taskId={id}
                        dependsOnTaskId={d.depends_on_task_id}
                      />
                    ) : null}
                  </div>
                ))
              )}
              {waiting && task.status === "blocked" ? (
                <p className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-meta text-text-2">
                  Waiting on dependencies.
                </p>
              ) : null}
              {canManage ? (
                <DependencyManager
                  ws={ws}
                  taskId={id}
                  candidates={(projectTasks ?? []) as { id: string; title: string }[]}
                  existing={deps.map((d) => d.depends_on_task_id)}
                />
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-body font-semibold text-text-1">
                <History className="size-4 text-text-3" strokeWidth={1.5} />
                Activity
              </h4>
              <span className="flex items-center gap-1 text-label text-text-3">
                <MessageSquare className="size-3.5" strokeWidth={1.5} />
                {comments.length}
              </span>
            </div>
            <div className="mt-3">
              <ActivityFeed
                activity={activity}
                comments={comments}
                composer={<CommentForm ws={ws} taskId={id} />}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
