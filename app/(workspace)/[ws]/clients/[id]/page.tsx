import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import {
  ClientStageChip,
  ConfidentialChip,
  ProjectStatusChip,
} from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Breadcrumbs, CodeLabel } from "@/components/primitives/misc";
import { RightRailPanel } from "@/components/primitives/right-rail";
import { EmptyState } from "@/components/primitives/empty-state";
import { StatCard } from "@/components/primitives/stat-card";
import { Button } from "@/components/ui/button";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { fmtMoney } from "@/lib/format";
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
import { StageSelect } from "@/components/features/clients/stage-select";
import { ClientTabs } from "@/components/features/clients/client-tabs";
import {
  ProjectIntakePanel,
  IntakeStatusTag,
} from "@/components/features/clients/project-intake-panel";
import { CommercialsPanel } from "@/components/features/clients/commercials-card";
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
  ProjectCommercials,
  ProjectIntake,
  VClient,
} from "@/lib/types";

export const metadata: Metadata = { title: "Client" };

const TAB_KEYS = ["activity", "projects", "money", "details"] as const;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { ws, id } = await params;
  const sp = await searchParams;
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

  const [{ data: projectRows }, { data: taskRows }, ownerMap] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, title, status, owner_id")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("status, due_date, completed_at, revision_count, project:projects!inner(client_id)")
      .eq("project.client_id", id),
    getOwnerProfiles(client.owner_id ? [client.owner_id] : []),
  ]);
  const projects = (projectRows ?? []) as (ClientProjectRow & { owner_id: string | null })[];
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
            <CodeLabel code={client.code} className="text-body" />
            <ClientStageChip stage={client.stage} />
          </div>
          <h1 className="mt-1.5 font-mono page-title">
            {client.code}
          </h1>
          {owner ? (
            <p className="mt-1 flex items-center gap-1.5 text-body text-text-2">
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
  const projectIds = projects.map((p) => p.id);
  const [
    { data: contacts },
    { data: payments },
    { data: documents },
    { data: activity },
    { data: todos },
    { data: notes },
    { data: intakeRows },
    { data: commercialRows },
    { data: memberRows },
    owners,
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }).order("created_at"),
    supabase.from("client_payments").select("*").eq("client_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("client_documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("client_activity").select("*").eq("client_id", id).order("created_at").limit(80),
    supabase.from("client_todos").select("*").eq("client_id", id).order("is_done").order("created_at", { ascending: false }),
    supabase.from("client_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    projectIds.length > 0
      ? supabase.from("project_intakes").select("*").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
    // RLS trims this to what the viewer may see: executives get all, the
    // assigned manager their own projects, everyone else nothing.
    projectIds.length > 0
      ? supabase.from("project_commercials").select("*").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("memberships")
      .select("profile_id, profile:profiles!profile_id(id, full_name, avatar_url)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("wall_side", "above")
      .eq("is_active", true),
    getOwnerOptions(ctx.workspace.id),
  ]);

  const people: ThreadPerson[] = ((memberRows ?? []) as unknown as { profile: ThreadPerson }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const intakeByProject = new Map(
    ((intakeRows ?? []) as ProjectIntake[]).map((i) => [i.project_id, i])
  );
  const commercialsByProject = new Map(
    ((commercialRows ?? []) as ProjectCommercials[]).map((c) => [c.project_id, c])
  );
  const paymentRows = (payments ?? []) as ClientPayment[];
  const todoRows = (todos ?? []) as ClientTodo[];
  const isExec = ctx.membership.archetype === "executive";

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

  const active = TAB_KEYS.includes(sp.tab as (typeof TAB_KEYS)[number])
    ? (sp.tab as string)
    : "activity";
  const openTodos = todoRows.filter((t) => !t.is_done).length;
  const unpaid = paymentRows.filter((p) => !p.paid_at);
  const paid = paymentRows.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = unpaid.reduce((s, p) => s + Number(p.amount), 0);

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
            <CodeLabel code={client.code} className="text-body" />
            <ClientStageChip stage={client.stage} />
            {isConfidential(client) ? <ConfidentialChip /> : null}
          </div>
          <h1 className="mt-1.5 page-title">
            {clientLabel(client)}
          </h1>
          {owner ? (
            <p className="mt-1 flex items-center gap-1.5 text-body text-text-2">
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
              canEditOrigin={isExec}
            />
          </div>
        ) : null}
      </div>

      <ClientTabs
        ws={ws}
        clientId={id}
        active={active}
        tabs={[
          { key: "activity", label: "Activity" },
          { key: "projects", label: "Projects", count: projects.length },
          { key: "money", label: "Money", count: unpaid.length },
          { key: "details", label: "Details" },
        ]}
      />

      {active === "activity" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardBody className="pt-5">
              <ActivityThread
                ws={ws}
                clientId={id}
                items={(activity ?? []) as ClientActivity[]}
                people={people}
              />
            </CardBody>
          </Card>
          <div className="flex flex-col gap-4">
            <RightRailPanel title={openTodos > 0 ? `To-dos, ${openTodos} open` : "To-dos"}>
              <TodosCard ws={ws} clientId={id} todos={todoRows} people={people} />
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
      ) : null}

      {active === "projects" ? (
        <div className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FolderKanban />}
                title="No projects yet. New work for this client starts here."
                action={
                  ctx.capabilities.canCreateProjects && client.stage !== "blacklist" ? (
                    <Button asChild>
                      <Link href={`/${ws}/projects/new`}>New project</Link>
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <div className="flex justify-end">
                {ctx.capabilities.canCreateProjects && client.stage !== "blacklist" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/${ws}/projects/new`}>
                      <Plus />
                      New project
                    </Link>
                  </Button>
                ) : null}
              </div>
              {projects.map((p) => {
                const intake = intakeByProject.get(p.id);
                const commercials = commercialsByProject.get(p.id) ?? null;
                const canEditCommercials = isExec || p.owner_id === ctx.userId;
                return (
                  <Card key={p.id}>
                    <CardHeader
                      title={
                        <span className="flex flex-wrap items-center gap-2.5">
                          <Link
                            href={`/${ws}/projects/${p.id}`}
                            className="hover:text-brand"
                          >
                            {p.title}
                          </Link>
                          <CodeLabel code={p.code} />
                          <ProjectStatusChip status={p.status} />
                          {intake ? <IntakeStatusTag status={intake.status} /> : null}
                        </span>
                      }
                      action={
                        <Link
                          href={`/${ws}/projects/${p.id}`}
                          className="text-meta font-medium text-brand hover:underline"
                        >
                          Open project
                        </Link>
                      }
                    />
                    <CardBody>
                      <div
                        className={`grid gap-5 ${commercials || canEditCommercials ? "md:grid-cols-[1fr_240px]" : ""}`}
                      >
                        {intake ? (
                          <div>
                            <p className="group-label mb-2">Intake</p>
                            <ProjectIntakePanel
                              ws={ws}
                              projectId={p.id}
                              clientId={id}
                              intake={intake}
                            />
                          </div>
                        ) : (
                          <p className="text-meta text-text-3">
                            Internal project, no intake.
                          </p>
                        )}
                        {commercials || canEditCommercials ? (
                          <div className="md:border-l md:border-border md:pl-5">
                            <p className="group-label mb-2">Commercials</p>
                            <CommercialsPanel
                              ws={ws}
                              projectId={p.id}
                              clientId={id}
                              commercials={commercials}
                              canEdit={canEditCommercials}
                            />
                          </div>
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      ) : null}

      {active === "money" ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              icon={<Wallet />}
              value={client.contract_value !== null ? fmtMoney(client.contract_value) : "—"}
              label="Account value"
              tone="violet"
            />
            <StatCard icon={<Wallet />} value={fmtMoney(paid)} label="Paid" tone="green" />
            <StatCard
              icon={<Wallet />}
              value={fmtMoney(outstanding)}
              label="Outstanding"
              tone={outstanding > 0 ? "amber" : "green"}
            />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader title="Payments" />
              <CardBody>
                <PaymentsCard
                  ws={ws}
                  clientId={id}
                  payments={paymentRows}
                  projects={projects.map((p) => ({ id: p.id, code: p.code }))}
                />
              </CardBody>
            </Card>
            {commercialsByProject.size > 0 ? (
              <RightRailPanel title="Project pricing">
                <div className="flex flex-col gap-2">
                  {projects
                    .filter((p) => commercialsByProject.has(p.id))
                    .map((p) => {
                      const c = commercialsByProject.get(p.id)!;
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <CodeLabel code={p.code} />
                          <span className="text-right">
                            <span className="block font-mono text-body font-medium text-text-1 tabular">
                              {c.price != null ? fmtMoney(Number(c.price)) : "—"}
                            </span>
                            {c.invoice_terms ? (
                              <span className="block text-label text-text-3">
                                {c.invoice_terms}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  <p className="mt-1 text-label text-text-3">
                    Only executives and assigned managers see pricing.
                  </p>
                </div>
              </RightRailPanel>
            ) : null}
          </div>
        </div>
      ) : null}

      {active === "details" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Contacts" />
              <CardBody>
                <ContactsCard
                  ws={ws}
                  clientId={id}
                  contacts={(contacts ?? []) as ClientContact[]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Documents" />
              <CardBody>
                <DocumentsCard
                  ws={ws}
                  clientId={id}
                  documents={(documents ?? []) as ClientDocument[]}
                />
              </CardBody>
            </Card>
          </div>
          <ClientIdentityCard client={client} health={health} />
        </div>
      ) : null}
    </div>
  );
}
