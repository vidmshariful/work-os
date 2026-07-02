import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { TemplateManager } from "@/components/features/admin/template-editor";
import type { ProjectTemplate } from "@/lib/types";

export const metadata: Metadata = { title: "Templates" };

export default async function AdminTemplatesPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data } = await supabase
    .from("project_templates")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("is_default", { ascending: false })
    .order("name");

  return <TemplateManager ws={ws} templates={(data ?? []) as ProjectTemplate[]} />;
}
