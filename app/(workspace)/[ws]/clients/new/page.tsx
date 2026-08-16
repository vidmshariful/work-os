import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import {
  NewClientForm,
  type KickoffTemplateOption,
} from "@/components/features/clients/client-form";
import { getOwnerOptions } from "@/components/features/clients/queries";
import type { ProjectTemplate } from "@/lib/types";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageClients) redirect(`/${ws}/clients`);

  const supabase = await createClient();
  const [owners, { data: templateRows }, { data: leadRow }] = await Promise.all([
    getOwnerOptions(ctx.workspace.id),
    supabase
      .from("project_templates")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id(full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("role", "creative_lead")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const templates: KickoffTemplateOption[] = (
    (templateRows ?? []) as ProjectTemplate[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    phases: (t.structure?.phases ?? []).length,
    tasks: (t.structure?.phases ?? []).reduce(
      (acc, p) => acc + (p.tasks?.length ?? 0),
      0
    ),
    deliverables: (t.structure?.deliverables ?? []).length,
    is_default: t.is_default,
  }));

  const lead = leadRow as unknown as { profile: { full_name: string } } | null;
  const ownerName = lead?.profile?.full_name ?? "the Creative Lead";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/${ws}/clients` },
          { label: "New client" },
        ]}
      />
      <div>
        <h1 className="page-title">
          New client
        </h1>
        <p className="page-subtitle mt-1">
          They paid, so they exist. Everything after this runs itself.
        </p>
      </div>
      <Card>
        <CardBody className="pt-5">
          <NewClientForm
            ws={ws}
            owners={owners}
            templates={templates}
            ownerName={ownerName}
          />
        </CardBody>
      </Card>
    </div>
  );
}
