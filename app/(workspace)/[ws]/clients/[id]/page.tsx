import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { ClientStatusChip, ConfidentialChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { ClientIdentityCard } from "@/components/features/clients/client-identity-card";
import {
  ClientProjectsCard,
  type ClientProjectRow,
} from "@/components/features/clients/client-projects-card";
import { ClientForm } from "@/components/features/clients/client-form";
import { getOwnerOptions, getOwnerProfiles } from "@/components/features/clients/queries";
import type { VClient } from "@/lib/types";

export const metadata: Metadata = { title: "Client" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: clientRow } = await supabase
    .from("v_clients")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!clientRow) notFound();
  const client = clientRow as VClient;
  const unmasked = isUnmasked(client);

  const [{ data: projectRows }, ownerMap] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, title, status")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    getOwnerProfiles(client.owner_id ? [client.owner_id] : []),
  ]);
  const owner = client.owner_id ? ownerMap[client.owner_id] ?? null : null;
  const canEdit = ctx.capabilities.canManageClients && unmasked;
  const owners = canEdit ? await getOwnerOptions(ctx.workspace.id) : [];

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/${ws}/clients` },
          { label: unmasked ? clientLabel(client) : client.code },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeLabel code={client.code} className="text-[13px]" />
            <ClientStatusChip status={client.status} />
            {unmasked && isConfidential(client) ? <ConfidentialChip /> : null}
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-text-1">
            {clientLabel(client)}
          </h1>
          {owner ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-text-2">
              <PersonAvatar name={owner.full_name} src={owner.avatar_url} size={20} />
              Owned by {owner.full_name}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`grid gap-4 ${unmasked ? "lg:grid-cols-[1fr_320px]" : ""}`}
      >
        <div className="flex flex-col gap-4">
          <ClientProjectsCard
            projects={(projectRows ?? []) as ClientProjectRow[]}
            ws={ws}
            canCreateProjects={ctx.capabilities.canCreateProjects}
          />
          {canEdit ? (
            <Card>
              <CardHeader title="Edit client" />
              <CardBody>
                <ClientForm
                  ws={ws}
                  owners={owners}
                  client={client}
                  canEditOrigin={ctx.membership.archetype === "executive"}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
        {unmasked ? <ClientIdentityCard client={client} /> : null}
      </div>
    </div>
  );
}
