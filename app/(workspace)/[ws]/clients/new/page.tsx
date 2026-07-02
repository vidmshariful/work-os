import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { ClientForm } from "@/components/features/clients/client-form";
import { getOwnerOptions } from "@/components/features/clients/queries";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageClients) redirect(`/${ws}/clients`);

  const owners = await getOwnerOptions(ctx.workspace.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/${ws}/clients` },
          { label: "New client" },
        ]}
      />
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          New client
        </h1>
        <p className="mt-1 text-sm text-text-2">
          The handoff runs itself: project, phases, tasks, and notifications.
        </p>
      </div>
      <Card>
        <CardHeader title="Client details" />
        <CardBody>
          <ClientForm ws={ws} owners={owners} canEditOrigin={true} />
        </CardBody>
      </Card>
    </div>
  );
}
