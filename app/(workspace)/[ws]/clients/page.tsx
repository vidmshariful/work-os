import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, FolderKanban, Kanban, List, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import { CountBadge } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { ClientRow } from "@/components/features/clients/client-row";
import { ClientFilters } from "@/components/features/clients/client-filters";
import {
  PipelineBoard,
  type PipelineClient,
} from "@/components/features/clients/pipeline-board";
import { STAGE_META, STAGE_ORDER } from "@/components/features/clients/stage";
import {
  getOwnerOptions,
  getOwnerProfiles,
} from "@/components/features/clients/queries";
import type { ClientPayment, ClientStage, VClient } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{
    view?: string;
    q?: string;
    stage?: string;
    origin?: string;
    owner?: string;
  }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const stageFilter = STAGE_ORDER.includes(sp.stage as ClientStage) ? sp.stage! : "";
  const originFilter = sp.origin ?? "";
  const ownerFilter = sp.owner ?? "";
  // The pipeline is an above-wall surface: it carries money and intake.
  const view = sp.view === "pipeline" && ctx.aboveWall ? "pipeline" : "list";

  let query = supabase
    .from("v_clients")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("code");
  if (q) query = query.or(`code.ilike.%${q}%,commercial_name.ilike.%${q}%`);
  if (stageFilter) query = query.eq("stage", stageFilter);
  if (originFilter && ctx.aboveWall) query = query.eq("origin", originFilter);
  if (ownerFilter) query = query.eq("owner_id", ownerFilter);

  const [{ data: clientRows }, { count: inFlight }] = await Promise.all([
    query,
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "in_progress"),
  ]);

  const clients = (clientRows ?? []) as VClient[];
  const clientIds = clients.map((c) => c.id);

  // Payments exist above the wall only; below it this returns zero rows.
  const { data: paymentRows } = ctx.aboveWall && clientIds.length > 0
    ? await supabase.from("client_payments").select("*").in("client_id", clientIds)
    : { data: [] };
  const outstandingByClient = new Map<string, number>();
  for (const p of (paymentRows ?? []) as ClientPayment[]) {
    if (!p.paid_at) {
      outstandingByClient.set(
        p.client_id,
        (outstandingByClient.get(p.client_id) ?? 0) + Number(p.amount)
      );
    }
  }

  const [owners, ownerOptions] = await Promise.all([
    getOwnerProfiles(
      Array.from(new Set(clients.map((c) => c.owner_id).filter(Boolean))) as string[]
    ),
    ctx.aboveWall ? getOwnerOptions(ctx.workspace.id) : Promise.resolve([]),
  ]);

  const activeCount = clients.filter((c) => c.stage === "active").length;
  const onboardCount = clients.filter((c) => c.stage === "onboard").length;
  const anyUnmasked = clients.some((c) => c.commercial_name !== null);
  const totalValue = clients
    .filter((c) => c.stage !== "blacklist")
    .reduce((sum, c) => sum + (c.contract_value ?? 0), 0);
  const totalOutstanding = Array.from(outstandingByClient.values()).reduce(
    (a, b) => a + b,
    0
  );

  const now = Date.now();
  const pipelineClients: PipelineClient[] = clients.map((c) => ({
    ...c,
    daysInStage: Math.max(
      0,
      Math.floor((now - new Date(c.stage_changed_at).getTime()) / 86400000)
    ),
    outstanding: outstandingByClient.get(c.id) ?? 0,
  }));

  const viewTab = (v: string, label: string, icon: React.ReactNode) => (
    <Link
      href={`/${ws}/clients${v === "pipeline" ? "?view=pipeline" : ""}`}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-meta font-medium transition-colors",
        view === v ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
      )}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Clients
          </h1>
          <p className="page-subtitle mt-1">
            The relationship pipeline, from onboarding to done.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.aboveWall ? (
            <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
              {viewTab("list", "List", <List />)}
              {viewTab("pipeline", "Pipeline", <Kanban />)}
            </div>
          ) : null}
          {ctx.capabilities.canManageClients ? (
            <Button asChild>
              <Link href={`/${ws}/clients/new`}>
                <Plus />
                New client
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={`grid grid-cols-2 gap-4 ${anyUnmasked ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}
      >
        <StatCard icon={<Briefcase />} value={activeCount} label="Active clients" tone="green" />
        <StatCard
          icon={<FolderKanban />}
          value={onboardCount || (inFlight ?? 0)}
          label={onboardCount ? "In onboarding" : "Projects in flight"}
          tone="blue"
        />
        {anyUnmasked ? (
          <>
            <StatCard
              icon={<Wallet />}
              value={fmtMoney(totalValue)}
              label="Contracted value"
              tone="violet"
            />
            <StatCard
              icon={<Wallet />}
              value={fmtMoney(totalOutstanding)}
              label="Outstanding"
              hint={totalOutstanding > 0 ? "Unpaid scheduled payments" : "All settled"}
              tone={totalOutstanding > 0 ? "amber" : "green"}
            />
          </>
        ) : null}
      </div>

      <ClientFilters
        ws={ws}
        view={view}
        q={q}
        stage={stageFilter}
        origin={originFilter}
        owner={ownerFilter}
        owners={ownerOptions}
        aboveWall={ctx.aboveWall}
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase />}
            title={
              q || stageFilter || originFilter || ownerFilter
                ? "No clients match these filters."
                : "No clients yet. The first closed deal starts everything."
            }
            action={
              ctx.capabilities.canManageClients ? (
                <Button asChild>
                  <Link href={`/${ws}/clients/new`}>New client</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "pipeline" ? (
        <PipelineBoard ws={ws} clients={pipelineClients} owners={owners} />
      ) : (
        <div className="flex flex-col gap-5">
          {STAGE_ORDER.filter(
            (stage) => clients.some((c) => c.stage === stage)
          ).map((stage) => {
            const inStage = clients.filter((c) => c.stage === stage);
            return (
              <section key={stage}>
                <div className="flex items-center gap-2 px-1">
                  <span className="group-label">{STAGE_META[stage].label}</span>
                  <CountBadge count={inStage.length} className="ml-0" />
                </div>
                <Card className="mt-2">
                  {inStage.map((c) => (
                    <ClientRow
                      key={c.id}
                      client={c}
                      owner={c.owner_id ? owners[c.owner_id] ?? null : null}
                      ws={ws}
                      outstanding={outstandingByClient.get(c.id) ?? null}
                    />
                  ))}
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
