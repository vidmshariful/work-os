import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { clientLabel } from "@/lib/wall";
import {
  NewProjectForm,
  type ClientOption,
  type DeptOption,
  type TemplateOption,
} from "@/components/features/projects/new-project-form";
import type { MemberOption } from "@/components/features/projects/types";
import type { VClient } from "@/lib/types";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ department?: string; list?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateProjects) redirect(`/${ws}/projects`);

  const supabase = await createClient();
  const [
    { data: templates },
    { data: clients },
    { data: memberRows },
    { data: deptRows },
    { data: listRows },
  ] = await Promise.all([
    supabase
      .from("project_templates")
      .select("id, name, project_type")
      .eq("workspace_id", ctx.workspace.id)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("v_clients")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "active")
      .order("code"),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    supabase
      .from("departments")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id)
      .order("sort_order"),
    supabase.from("project_lists").select("id, name, department_id").order("sort_order"),
  ]);

  const clientOptions: ClientOption[] = ((clients ?? []) as VClient[]).map(
    (c) => ({ id: c.id, label: clientLabel(c) })
  );
  const members = ((memberRows ?? []) as unknown as { profile: MemberOption }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const lists = (listRows ?? []) as { id: string; name: string; department_id: string }[];
  const departments: DeptOption[] = ((deptRows ?? []) as { id: string; name: string }[]).map(
    (d) => ({
      id: d.id,
      name: d.name,
      lists: lists
        .filter((l) => l.department_id === d.id)
        .map((l) => ({ id: l.id, name: l.name })),
    })
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Projects", href: `/${ws}/projects` },
          { label: "New project" },
        ]}
      />
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          New project
        </h1>
        <p className="mt-1 text-sm text-text-2">
          A template scaffolds the phases, tasks, and deliverables for you.
        </p>
      </div>
      <Card>
        <CardHeader title="Project details" />
        <CardBody>
          <NewProjectForm
            ws={ws}
            templates={(templates ?? []) as TemplateOption[]}
            clients={clientOptions}
            members={members}
            departments={departments}
            defaultOwnerId={ctx.userId}
            defaultDepartmentId={sp.department}
            defaultListId={sp.list}
          />
        </CardBody>
      </Card>
    </div>
  );
}
