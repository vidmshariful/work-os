import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MyTasksList, type MyTask } from "@/components/features/tasks/my-tasks-list";
import { TeamBoard, type BoardTask } from "@/components/features/tasks/team-board";

export const metadata: Metadata = { title: "My Tasks" };

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[9px] px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
      )}
    >
      {children}
    </Link>
  );
}

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ tab?: string; group?: string; assignee?: string; project?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  const isBoard = sp.tab === "board" && ctx.capabilities.canAssignTasks;
  const groupBy = sp.group === "due" ? "due" : "status";
  const supabase = await createClient();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
            {isBoard ? "Team board" : "My tasks"}
          </h1>
          <p className="mt-1 text-sm text-text-2">
            {isBoard
              ? "Everything in flight across the team."
              : "Your assignments, labeled by project code."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ctx.capabilities.canAssignTasks ? (
            <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
              <TabLink href={`/${ws}/tasks`} active={!isBoard}>
                My tasks
              </TabLink>
              <TabLink href={`/${ws}/tasks?tab=board`} active={isBoard}>
                Team board
              </TabLink>
            </div>
          ) : null}
          {!isBoard ? (
            <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
              <TabLink href={`/${ws}/tasks`} active={groupBy === "status"}>
                By status
              </TabLink>
              <TabLink href={`/${ws}/tasks?group=due`} active={groupBy === "due"}>
                By due date
              </TabLink>
            </div>
          ) : null}
          {ctx.capabilities.canAssignTasks ? (
            <Button asChild>
              <Link href={`/${ws}/tasks/new`}>
                <Plus />
                New task
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isBoard ? (
        <BoardContent ws={ws} workspaceId={ctx.workspace.id} sp={sp} />
      ) : (
        <MyTasksContent ws={ws} workspaceId={ctx.workspace.id} userId={ctx.userId} groupBy={groupBy} />
      )}
    </div>
  );
}

async function MyTasksContent({
  ws,
  workspaceId,
  userId,
  groupBy,
}: {
  ws: string;
  workspaceId: string;
  userId: string;
  groupBy: "status" | "due";
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, revision_count, completed_at, project:projects!inner(workspace_id, code)"
    )
    .eq("assignee_id", userId)
    .eq("project.workspace_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false });

  return <MyTasksList ws={ws} tasks={(data ?? []) as unknown as MyTask[]} groupBy={groupBy} />;
}

async function BoardContent({
  ws,
  workspaceId,
  sp,
}: {
  ws: string;
  workspaceId: string;
  sp: { assignee?: string; project?: string };
}) {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, assignee:profiles(id, full_name, avatar_url), project:projects!inner(id, code, workspace_id, status)"
    )
    .eq("project.workspace_id", workspaceId)
    .neq("project.status", "archived")
    .order("priority", { ascending: false });
  if (sp.assignee) query = query.eq("assignee_id", sp.assignee);
  if (sp.project) query = query.eq("project_id", sp.project);
  const { data } = await query;

  return <TeamBoard ws={ws} tasks={(data ?? []) as unknown as BoardTask[]} />;
}
