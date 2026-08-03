import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { TemplateManager } from "@/components/features/admin/template-editor";
import type { TemplateFieldOption } from "@/components/features/admin/shared";
import type { ProjectField, ProjectTemplate } from "@/lib/types";

export const metadata: Metadata = { title: "Templates" };

export default async function AdminTemplatesPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data }, { data: fieldRows }, { data: spaces }] = await Promise.all([
    supabase
      .from("project_templates")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("project_fields")
      .select("id, name, kind, options, department_id")
      .eq("workspace_id", ctx.workspace.id)
      .order("sort_order"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id),
  ]);

  // Fields a template can fill in, each carrying the name of the one space
  // it is scoped to so the editor can say so out loud.
  const spaceName = new Map(
    ((spaces ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])
  );
  const fields: TemplateFieldOption[] = (
    (fieldRows ?? []) as Pick<
      ProjectField,
      "id" | "name" | "kind" | "options" | "department_id"
    >[]
  ).map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    options: f.options ?? [],
    space: f.department_id ? spaceName.get(f.department_id) ?? null : null,
  }));

  return (
    <TemplateManager
      ws={ws}
      templates={(data ?? []) as ProjectTemplate[]}
      fields={fields}
    />
  );
}
