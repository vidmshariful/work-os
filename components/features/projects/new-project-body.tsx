import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { clientLabel } from "@/lib/wall";
import { ProjectModal } from "@/components/features/projects/project-modal";
import {
  NewProjectForm,
  type ClientOption,
  type DeptOption,
  type TemplateOption,
} from "@/components/features/projects/new-project-form";
import type { MemberOption } from "@/components/features/projects/types";
import type { VClient } from "@/lib/types";

// The create form, drawn either as its own page or inside the floating panel.
//
// It needs both for a reason worth stating. /projects/new sits beside
// /projects/[id], so the intercepting route next door matched it with
// id = "new", went looking for a project by that name and found none. An
// intercepted navigation deliberately leaves the page underneath alone, so
// no amount of fixing the lookup would have made the form appear: the only
// answers are to stop being a sibling of [id], or to give the panel
// something real to show. This is the second, and it is the better one:
// New project now opens over the list the same way a project does, and the
// list is still there when you close it.
export async function NewProjectBody({
  ws,
  department,
  list,
  shell = "page",
}: {
  ws: string;
  department?: string;
  list?: string;
  shell?: "page" | "panel";
}) {
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

  const clientOptions: ClientOption[] = ((clients ?? []) as VClient[]).map((c) => ({
    id: c.id,
    label: clientLabel(c),
  }));
  const members = ((memberRows ?? []) as unknown as { profile: MemberOption }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const lists = (listRows ?? []) as { id: string; name: string; department_id: string }[];
  const departments: DeptOption[] = ((deptRows ?? []) as { id: string; name: string }[]).map(
    (d) => ({
      id: d.id,
      name: d.name,
      lists: lists.filter((l) => l.department_id === d.id).map((l) => ({ id: l.id, name: l.name })),
    })
  );

  const form = (
    <NewProjectForm
      ws={ws}
      templates={(templates ?? []) as TemplateOption[]}
      clients={clientOptions}
      members={members}
      departments={departments}
      defaultOwnerId={ctx.userId}
      defaultDepartmentId={department}
      defaultListId={list}
    />
  );

  if (shell === "panel") {
    const qs = new URLSearchParams();
    if (department) qs.set("department", department);
    if (list) qs.set("list", list);
    const href = `/${ws}/projects/new${qs.size ? `?${qs}` : ""}`;
    return (
      <ProjectModal href={href}>
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
          <div>
            <h1 className="text-h2 font-semibold tracking-tight text-text-1">New project</h1>
            <p className="page-subtitle mt-1">
              A template scaffolds the phases, tasks, and deliverables for you.
            </p>
          </div>
          {form}
        </div>
      </ProjectModal>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Breadcrumbs
        items={[{ label: "Projects", href: `/${ws}/projects` }, { label: "New project" }]}
      />
      <div>
        <h1 className="page-title">New project</h1>
        <p className="page-subtitle mt-1">
          A template scaffolds the phases, tasks, and deliverables for you.
        </p>
      </div>
      <Card>
        <CardHeader title="Project details" />
        <CardBody>{form}</CardBody>
      </Card>
    </div>
  );
}
