import Link from "next/link";
import {
  Compass,
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
  Tag,
} from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressBar } from "@/components/primitives/progress";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { RightRailPanel } from "@/components/primitives/right-rail";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { ProjectStatusSelect } from "@/components/features/projects/status-select";
import { DeliverableToggle } from "@/components/features/projects/deliverable-toggle";
import { ProjectFiles } from "@/components/features/projects/project-files";
import { ProjectMissing, ProjectModal } from "@/components/features/projects/project-modal";
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
import { fieldsForSpace } from "@/components/features/projects/types";
import type {
  ProgressRow,
  ProjectWithOwner,
  TaskWithAssignee,
} from "@/components/features/projects/types";
import { ProjectFields } from "@/components/features/projects/project-fields";
import { ProjectProperties } from "@/components/features/projects/project-properties";
import type {
  Deliverable,
  ProjectCommercials,
  ProjectField,
  ProjectIntake,
  ProjectPhase,
  VClient,
} from "@/lib/types";

// The full page's answer for a project that is not there. Deliberately the
// same words the workspace not-found page uses, so the two do not read as
// different problems, and deliberately not a lock or a redaction hint: below
// the wall this covers "deleted" and "not yours to see" alike.
function ProjectGone() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <Compass className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-1">Not found</h2>
        <p className="mt-1 text-sm text-text-2">
          This project does not exist, or it is not available to you.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

// The project detail body, shared by two routes. /[ws]/projects/[id] renders
// it as a page; the @modal slot renders the same component inside a floating
// panel when you arrive from somewhere in the app. One component, so the two
// can never show different things.
export async function ProjectDetail({
  ws,
  id,
  shell = "page",
}: {
  ws: string;
  id: string;
  // Which frame the body goes in. The panel owns its own frame rather than
  // being wrapped by the route, because only this component knows whether the
  // project is there, and the two answers need different frames.
  shell?: "page" | "panel";
}) {
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // Everything that only needs the project id starts now, in parallel with
  // the project row itself. It used to wait for that row to come back before
  // any of it began, which put one whole round trip in front of every render
  // of this page: every open of the floating panel, and every server action
  // that revalidates it. Only three of the reads genuinely need a column off
  // the project; they start when it lands and finish alongside this group.
  const independent = Promise.all([
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
      .select("id, name, slug")
      .eq("workspace_id", ctx.workspace.id)
      // An archived space is not a filing destination, which is what every
      // other surface already assumes.
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("project_lists")
      .select("id, name, department_id, folder_id")
      .is("archived_at", null)
      .order("sort_order"),
    supabase.from("project_folders").select("id, name").order("sort_order"),
    // Custom fields: the definitions for this workspace, and this project's
    // values. RLS scopes the values through projects_select, so a value is
    // readable exactly when its project is.
    supabase
      .from("project_fields")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("sort_order"),
    supabase
      .from("project_field_values")
      .select("field_id, value")
      .eq("project_id", id),
    // Oldest first, so the thread reads top to bottom like a conversation.
    supabase
      .from("project_comments")
      .select("id, body, created_at, author:profiles!author_id(id, full_name, avatar_url)")
      .eq("project_id", id)
      .order("created_at"),
    // Direct and rolled-up counts, computed in the database.
    supabase.from("v_project_progress").select("*").eq("project_id", id).maybeSingle(),
  ]);
  // A missing project throws out of here before those reads are awaited, so
  // the group keeps a handler and cannot become an unhandled rejection.
  independent.catch(() => {});

  const { data: projectRow } = await supabase
    .from("projects")
    .select("*, owner:profiles!projects_owner_id_fkey(id, full_name, avatar_url)")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  // A project that will not load: deleted since the list was drawn, or in a
  // space this person cannot see.
  //
  // NOTHING HERE MAY CALL notFound(), and that is not a style choice.
  //
  // Opening the panel is one request that renders two things: the @modal slot
  // with this component in it, and the page for the same URL underneath.
  // notFound() thrown by either one marks the whole segment as not found, so
  // Next answers with the workspace not-found page and drops the slot it had
  // already rendered. The result on screen was the list, the filters and the
  // scroll position all replaced by a 404, from one click on one dead row.
  //
  // Verified on the running app in that order: a not-found boundary inside
  // the slot rendered in the panel and the page underneath was still
  // replaced, because the throw came from the page rendering beside it. Only
  // when neither one throws does the panel open over an intact list.
  //
  // The cost is that a direct visit to a project that is gone answers 200
  // with this body rather than a 404. For an internal tool behind a login
  // that is a fair trade for the panel working at all.
  if (!projectRow) {
    return shell === "panel" ? <ProjectMissing /> : <ProjectGone />;
  }
  const project = projectRow as unknown as ProjectWithOwner;

  // The three that need a column off the project row start the moment it
  // lands, alongside whatever of the group above is still running, rather
  // than after all of it. Awaiting the group first would put the slowest of
  // fifteen reads in front of these three and leave the page with two
  // waits again, which is the shape this was written to remove.
  const dependent = Promise.all([
    project.client_id
      ? supabase.from("v_clients").select("*").eq("id", project.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // The family: for a parent, its sub-projects; for a sub-project, its
    // siblings (so any video shows the rest of its series).
    supabase
      .from("projects")
      .select("*, owner:profiles!projects_owner_id_fkey(id, full_name, avatar_url)")
      .eq("parent_project_id", project.parent_project_id ?? id)
      .order("created_at"),
    project.parent_project_id
      ? supabase.from("projects").select("id, code, title").eq("id", project.parent_project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [
    [
      { data: phaseRows },
      { data: taskRows },
      { data: deliverableRows },
      files,
      intakeRes,
      commercialsRes,
      { data: memberRows },
      { data: activityRows },
      { data: deptRows },
      { data: listRows },
      { data: folderRows },
      { data: fieldRows },
      { data: fieldValueRows },
      { data: commentRows },
      progressRes,
    ],
    [clientRes, { data: subProjectRows }, parentRes],
  ] = await Promise.all([independent, dependent]);

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
  const unmasked = client ? isUnmasked(client) : false;
  const clientCell = {
    href: client && unmasked ? `/${ws}/clients/${client.id}` : null,
    label: client && unmasked ? clientLabel(client) : null,
    code: client && !unmasked ? client.code : null,
    confidential: client ? unmasked && isConfidential(client) : false,
  };

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
  const deptRowsTyped = (deptRows ?? []) as {
    id: string;
    name: string;
    slug: string;
  }[];
  const departments = deptRowsTyped.map((d) => ({
    id: d.id,
    name: d.name,
    lists: deptLists
      .filter((l) => l.department_id === d.id)
      .map((l) => ({ id: l.id, name: l.name })),
  }));

  // Space, folder, list, project. The same trail people already read at the
  // top of a ClickUp task, built from whatever this project actually has: an
  // unfiled project simply gets a shorter one rather than empty crumbs.
  const space = deptRowsTyped.find((d) => d.id === project.department_id) ?? null;
  const listRow = (
    (listRows ?? []) as { id: string; name: string; folder_id: string | null }[]
  ).find((l) => l.id === project.list_id);
  const folderRow = listRow?.folder_id
    ? ((folderRows ?? []) as { id: string; name: string }[]).find(
        (f) => f.id === listRow.folder_id
      )
    : undefined;
  const trail: { label: string; href?: string }[] = [
    { label: "Spaces", href: `/${ws}/departments` },
  ];
  if (space) trail.push({ label: space.name, href: `/${ws}/departments/${space.slug}` });
  // A folder has no page of its own, so it reads as plain text, the way it
  // does in the sidebar.
  if (folderRow) trail.push({ label: folderRow.name });
  if (space && listRow) {
    trail.push({
      label: listRow.name,
      href: `/${ws}/departments/${space.slug}/lists/${listRow.id}`,
    });
  }
  trail.push({ label: project.code });

  // Workspace-wide fields plus any scoped to this project's space, each
  // paired with its value. A field with no value row renders as Empty.
  const valueByField = new Map(
    ((fieldValueRows ?? []) as { field_id: string; value: unknown }[]).map((v) => [
      v.field_id,
      v.value,
    ])
  );
  const fields = fieldsForSpace(
    (fieldRows ?? []) as ProjectField[],
    project.department_id
  ).map((f) => ({ field: f, value: valueByField.get(f.id) ?? null }));
  // One source for how this project's due date reads, shared with every row
  // and board card through the same helper.
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

  const body = (
    <div className="flex flex-col gap-5">
      {/* The trail people already read in ClickUp: space, folder, list, then
          the project. Each part is only shown when the project actually has
          it, so an unfiled project still gets a sensible short trail. */}
      <Breadcrumbs items={trail} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CodeLabel code={project.code} className="text-[13px]" />
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
          {/* Everything a person asks about a project at a glance, in one
              block that never collapses. A deliberate sibling of the Fields
              block below it: same row shell, same Empty convention. */}
          <ProjectProperties
            ws={ws}
            project={{
              id: project.id,
              status: project.status,
              type: project.type,
              start_date: project.start_date,
              due_date: project.due_date,
              created_at: project.created_at,
              owner: project.owner,
            }}
            client={clientCell}
            members={members}
            assignees={assignees}
            canEdit={canManage}
          />

          {/* The Fields block, which is where the studio's own process
              lives: production stage, category, script, the Drive and Figma
              links. Renders nothing when the workspace has defined none. */}
          <ProjectFields
            ws={ws}
            projectId={id}
            fields={fields}
            canEdit={canManage}
          />

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

  return shell === "panel" ? (
    <ProjectModal href={`/${ws}/projects/${id}`}>{body}</ProjectModal>
  ) : (
    body
  );
}
