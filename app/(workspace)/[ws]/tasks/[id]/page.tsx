import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitBranch, History, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { TaskStatusChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { fmtTimeAgo } from "@/lib/format";
import { TaskStatusSelect } from "@/components/features/tasks/task-status-select";
import {
  PriorityTag,
  DueDateLabel,
} from "@/components/features/tasks/task-bits";
import {
  AssigneeSelect,
  CommentForm,
  DependencyManager,
  RemoveDependencyButton,
  RevisionForm,
} from "@/components/features/tasks/detail-forms";
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
    { data: comments },
    { data: revisions },
    { data: depRows },
    { data: projectTasks },
    { data: memberRows },
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
            <CodeLabel code={task.project.code} className="text-[13px]" />
            <TaskStatusChip status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.phase ? (
              <span className="text-[12.5px] text-text-3">{task.phase.name}</span>
            ) : null}
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-text-1">
            {task.title}
          </h1>
        </div>
        {isMine || canManage ? (
          <TaskStatusSelect ws={ws} taskId={id} status={task.status} />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Description" />
            <CardBody>
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-1">
                  {task.description}
                </p>
              ) : (
                <p className="text-[13px] text-text-3">No description.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <History className="size-4 text-text-3" strokeWidth={1.5} />
                  Revisions
                  <span className="font-mono text-[12px] font-medium text-text-3 tabular">
                    {task.revision_count}
                  </span>
                </span>
              }
              action={<RevisionForm ws={ws} taskId={id} />}
            />
            <CardBody className="flex flex-col gap-3">
              {(revisions ?? []).length === 0 ? (
                <p className="text-[13px] text-text-3">
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
                        <p className="text-[12.5px]">
                          <span className="font-medium text-text-1">
                            {rev.requester?.full_name ?? "Someone"}
                          </span>{" "}
                          <span className="text-text-3">{fmtTimeAgo(rev.created_at)}</span>
                        </p>
                        {rev.note ? (
                          <p className="mt-0.5 text-sm text-text-2">{rev.note}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-text-3" strokeWidth={1.5} />
                  Comments
                </span>
              }
            />
            <CardBody className="flex flex-col gap-4">
              {(comments ?? []).map((c) => {
                const comment = c as unknown as {
                  id: string;
                  body: string;
                  created_at: string;
                  author: PersonRef | null;
                };
                return (
                  <div key={comment.id} className="flex gap-2.5">
                    <PersonAvatar
                      name={comment.author?.full_name}
                      src={comment.author?.avatar_url}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px]">
                        <span className="font-medium text-text-1">
                          {comment.author?.full_name ?? "Someone"}
                        </span>{" "}
                        <span className="text-text-3">{fmtTimeAgo(comment.created_at)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text-1">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                );
              })}
              <CommentForm ws={ws} taskId={id} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h4 className="text-[13px] font-semibold text-text-1">Details</h4>
            <div className="mt-3 flex flex-col gap-2.5 text-[12.5px]">
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
                <span className="text-text-1">{fmtTimeAgo(task.created_at)}</span>
              </div>
              {task.completed_at ? (
                <div className="flex items-center justify-between">
                  <span className="text-text-2">Completed</span>
                  <span className="text-text-1">{fmtTimeAgo(task.completed_at)}</span>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="flex items-center gap-2 text-[13px] font-semibold text-text-1">
              <GitBranch className="size-4 text-text-3" strokeWidth={1.5} />
              Dependencies
            </h4>
            <div className="mt-3 flex flex-col gap-2">
              {deps.length === 0 ? (
                <p className="text-[12.5px] text-text-3">No dependencies.</p>
              ) : (
                deps.map((d) => (
                  <div
                    key={d.depends_on_task_id}
                    className="group flex items-center gap-2 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-surface-2"
                  >
                    <Link
                      href={`/${ws}/tasks/${d.depends_on!.id}`}
                      className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-1 hover:text-brand"
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
                <p className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-[12px] text-text-2">
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
        </div>
      </div>
    </div>
  );
}
