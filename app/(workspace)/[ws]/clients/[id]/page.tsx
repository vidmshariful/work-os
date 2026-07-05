import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { ClientStageChip, ConfidentialChip } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { RightRailPanel } from "@/components/primitives/right-rail";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import {
  ClientIdentityCard,
  type ClientHealth,
} from "@/components/features/clients/client-identity-card";
import {
  ClientProjectsCard,
  type ClientProjectRow,
} from "@/components/features/clients/client-projects-card";
import { EditClientDialog } from "@/components/features/clients/edit-client-dialog";
import { ActivityThread, type ThreadPerson } from "@/components/features/clients/activity-thread";
import { IntakeCard, StageSelect } from "@/components/features/clients/intake-card";
import {
  ContactsCard,
  DocumentsCard,
  NotesCard,
  PaymentsCard,
  TodosCard,
} from "@/components/features/clients/workroom-cards";
import { getOwnerOptions, getOwnerProfiles } from "@/components/features/clients/queries";
import type {
  ClientActivity,
  ClientContact,
  ClientDocument,
  ClientNote,
  ClientPayment,
  ClientTodo,
  VClient,
} from "@/lib/types";

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

  // Work data, both sides of the wall.
  const [{ data: projectRows }, { data: taskRows }, ownerMap] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, title, status")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("status, due_date, completed_at, revision_count, project:projects!inner(client_id)")
      .eq("project.client_id", id),
    getOwnerProfiles(client.owner_id ? [client.owner_id] : []),
  ]);
  const projects = (projectRows ?? []) as ClientProjectRow[];
  const owner = client.owner_id ? ownerMap[client.owner_id] ?? null : null;

  // Below the wall the page is a code, a stage, and the work. Done.
  if (!unmasked) {
    return (
      <div className="flex flex-col gap-5">
        <Breadcrumbs
          items={[{ label: "Clients", href: `/${ws}/clients` }, { label: client.code }]}
        />
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeLabel code={client.code} className="text-[13px]" />
            <ClientStageChip stage={client.stage} />
          </div>
          <h1 className="mt-1.5 font-mono text-[26px] font-semibold tracking-tight text-text-1">
            {client.code}
          </h1>
          {owner ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-text-2">
              <PersonAvatar name={owner.full_name} src={owner.avatar_url} size={20} />
              Owned by {owner.full_name}
            </p>
          ) : null}
        </div>
        <ClientProjectsCard
          projects={projects}
          ws={ws}
          canCreateProjects={ctx.capabilities.canCreateProjects}
        />
      </div>
    );
  }

  // The workroom, above the wall.
  const [
    { data: contacts },
    { data: payments },
    { data: documents },
    { data: activity },
    { data: todos },
    { data: notes },
    { data: memberRows },
    owners,
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }).order("created_at"),
    supabase.from("client_payments").select("*").eq("client_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("client_documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("client_activity").select("*").eq("client_id", id).order("created_at").limit(80),
    supabase.from("client_todos").select("*").eq("client_id", id).order("is_done").order("created_at", { ascending: false }),
    supabase.from("client_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("profile_id, profile:profiles!profile_id(id, full_name, avatar_url)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("wall_side", "above")
      .eq("is_active", true),
    getOwnerOptions(ctx.workspace.id),
  ]);

  const people: ThreadPerson[] = ((memberRows ?? []) as unknown as {
    profile: ThreadPerson;
  }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  // Account health, computed from the work itself.
  const tasks = (taskRows ?? []) as unknown as {
    status: string;
    due_date: string | null;
    completed_at: string | null;
    revision_count: number;
  }[];
  const done = tasks.filter((t) => t.status === "done");
  const withDue = done.filter((t) => t.due_date);
  const onTime = withDue.filter(
    (t) => t.completed_at && t.completed_at.slice(0, 10) <= t.due_date!
  );
  const health: ClientHealth = {
    delivered: projects.filter((p) => p.status === "delivered").length,
    onTimeRate: withDue.length > 0 ? onTime.length / withDue.length : null,
    revisionRate:
      done.length > 0
        ? tasks.reduce((s, t) => s + t.revision_count, 0) / done.length
        : null,
  };

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/${ws}/clients` },
          { label: clientLabel(client) },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeLabel code={client.code} className="text-[13px]" />
            <ClientStageChip stage={client.stage} />
            {isConfidential(client) ? <ConfidentialChip /> : null}
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
        {ctx.capabilities.canManageClients ? (
          <div className="flex items-center gap-2">
            <StageSelect ws={ws} clientId={id} stage={client.stage} />
            <EditClientDialog
              ws={ws}
              client={client}
              owners={owners}
              canEditOrigin={ctx.membership.archetype === "executive"}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ActivityThread
                ws={ws}
                clientId={id}
                items={(activity ?? []) as ClientActivity[]}
                people={people}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="To-dos" />
            <CardBody>
              <TodosCard
                ws={ws}
                clientId={id}
                todos={(todos ?? []) as ClientTodo[]}
                people={people}
              />
            </CardBody>
          </Card>

          <ClientProjectsCard
            projects={projects}
            ws={ws}
            canCreateProjects={
              ctx.capabilities.canCreateProjects && client.stage !== "blacklist"
            }
          />
        </div>

        <div className="flex flex-col gap-4">
          <RightRailPanel title="Intake">
            <IntakeCard ws={ws} client={client} />
          </RightRailPanel>

          <RightRailPanel title="Payments">
            <PaymentsCard
              ws={ws}
              clientId={id}
              payments={(payments ?? []) as ClientPayment[]}
            />
          </RightRailPanel>

          <ClientIdentityCard client={client} health={health} />

          <RightRailPanel title="Contacts">
            <ContactsCard
              ws={ws}
              clientId={id}
              contacts={(contacts ?? []) as ClientContact[]}
            />
          </RightRailPanel>

          <RightRailPanel title="Documents">
            <DocumentsCard
              ws={ws}
              clientId={id}
              documents={(documents ?? []) as ClientDocument[]}
            />
          </RightRailPanel>

          <RightRailPanel title="Notes">
            <NotesCard
              ws={ws}
              clientId={id}
              notes={(notes ?? []) as ClientNote[]}
              people={people}
              userId={ctx.userId}
            />
          </RightRailPanel>
        </div>
      </div>
    </div>
  );
}
