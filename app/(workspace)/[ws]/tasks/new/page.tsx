import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import {
  NewTaskForm,
  type MemberOption,
  type ProjectOption,
} from "@/components/features/tasks/new-task-form";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canAssignTasks) redirect(`/${ws}/tasks`);

  const supabase = await createClient();
  const [{ data: projects }, { data: memberRows }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, title")
      .eq("workspace_id", ctx.workspace.id)
      .neq("status", "archived")
      .order("code"),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
  ]);

  const members = ((memberRows ?? []) as unknown as { profile: MemberOption }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Tasks", href: `/${ws}/tasks` },
          { label: "New task" },
        ]}
      />
      <div>
        <h1 className="page-title">
          New task
        </h1>
        <p className="page-subtitle mt-1">
          Assigning notifies the person automatically.
        </p>
      </div>
      <Card>
        <CardHeader title="Task details" />
        <CardBody>
          <NewTaskForm
            ws={ws}
            projects={(projects ?? []) as ProjectOption[]}
            members={members}
            defaultProjectId={sp.project ?? ""}
          />
        </CardBody>
      </Card>
    </div>
  );
}
