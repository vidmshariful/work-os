import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, FolderKanban, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { StatCard } from "@/components/primitives/stat-card";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import { ClientRow } from "@/components/features/clients/client-row";
import { getOwnerProfiles } from "@/components/features/clients/queries";
import type { VClient } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data: clientRows }, { count: inFlight }] = await Promise.all([
    supabase
      .from("v_clients")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("code"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "in_progress"),
  ]);

  const clients = (clientRows ?? []) as VClient[];
  const owners = await getOwnerProfiles(
    Array.from(new Set(clients.map((c) => c.owner_id).filter(Boolean))) as string[]
  );
  const active = clients.filter((c) => c.status === "active").length;
  // Contract totals only exist above the wall; below it the sum is simply 0
  // rows of data, so the card is not rendered at all.
  const anyUnmasked = clients.some((c) => c.commercial_name !== null);
  const totalValue = clients.reduce((sum, c) => sum + (c.contract_value ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
            Clients
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Every engagement the studio serves.
          </p>
        </div>
        {ctx.capabilities.canManageClients ? (
          <Button asChild>
            <Link href={`/${ws}/clients/new`}>
              <Plus />
              New client
            </Link>
          </Button>
        ) : null}
      </div>

      <div className={`grid grid-cols-2 gap-4 ${anyUnmasked ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <StatCard icon={<Briefcase />} value={active} label="Active clients" tone="blue" />
        <StatCard icon={<FolderKanban />} value={inFlight ?? 0} label="Projects in flight" tone="violet" />
        {anyUnmasked ? (
          <StatCard
            icon={<Wallet />}
            value={fmtMoney(totalValue)}
            label="Contracted value"
            tone="green"
          />
        ) : null}
      </div>

      <Card>
        {clients.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title="No clients yet. The first closed deal starts everything."
            action={
              ctx.capabilities.canManageClients ? (
                <Button asChild>
                  <Link href={`/${ws}/clients/new`}>New client</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          clients.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              owner={c.owner_id ? owners[c.owner_id] ?? null : null}
              ws={ws}
            />
          ))
        )}
      </Card>
    </div>
  );
}
