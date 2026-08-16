import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { DataTable } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";
import { CodeLabel } from "@/components/primitives/misc";
import { OwnerRow } from "@/components/features/admin/ownership-rows";
import { clientLabel } from "@/lib/wall";
import type { VClient } from "@/lib/types";

export const metadata: Metadata = { title: "Ownership" };

export default async function AdminOwnershipPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data: members }, { data: spaces }, { data: lists }, { data: projects }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("profile_id, profile:profiles(id, full_name)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      supabase
        .from("departments")
        .select("id, name, lead_id")
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
      supabase
        .from("project_lists")
        .select("id, name, owner_id, department:departments(name)")
        .order("sort_order"),
      supabase
        .from("projects")
        .select("id, code, title, owner_id")
        .eq("workspace_id", ctx.workspace.id)
        .neq("status", "archived")
        .order("code"),
    ]);

  const people = (members ?? [])
    .map((m) => {
      const p = m.profile as unknown as { id: string; full_name: string } | null;
      return p ? { id: p.id, name: p.full_name } : null;
    })
    .filter((p): p is { id: string; name: string } => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Clients are read only through v_clients, never the base table. This block
  // renders only above the wall, and when it does not render there is no
  // placeholder and no gap: the page is simply about spaces, lists, and
  // projects. Masking must look like the normal state of the world.
  let clients: VClient[] = [];
  if (ctx.aboveWall) {
    const { data } = await supabase
      .from("v_clients")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("code");
    clients = (data ?? []) as VClient[];
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Spaces" />
        <CardBody>
          <p className="pb-2 text-meta text-text-2">
            Who leads each space. Reporting lines stay the permission truth, so
            this is ownership, not access.
          </p>
          {(spaces ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 />}
              title="No spaces yet."
              action={
                <Link
                  href={`/${ws}/admin/departments`}
                  className="text-body font-medium text-brand hover:underline"
                >
                  Add a space
                </Link>
              }
            />
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "Space" },
                { key: "owner", label: "Lead", align: "right" },
              ]}
              rows={(spaces ?? []).map((s) => ({
                name: s.name,
                owner: (
                  <OwnerRow
                    ws={ws}
                    entity="space"
                    entityId={s.id}
                    ownerId={s.lead_id}
                    people={people}
                  />
                ),
              }))}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lists" />
        <CardBody>
          {(lists ?? []).length === 0 ? (
            <EmptyState icon={<Building2 />} title="No lists yet." />
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "List" },
                { key: "space", label: "Space" },
                { key: "owner", label: "Owner", align: "right" },
              ]}
              rows={(lists ?? []).map((l) => ({
                name: l.name,
                space:
                  (l.department as unknown as { name: string } | null)?.name ?? "",
                owner: (
                  <OwnerRow
                    ws={ws}
                    entity="list"
                    entityId={l.id}
                    ownerId={l.owner_id}
                    people={people}
                  />
                ),
              }))}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Projects" />
        <CardBody>
          {(projects ?? []).length === 0 ? (
            <EmptyState icon={<Building2 />} title="No active projects." />
          ) : (
            <DataTable
              columns={[
                { key: "code", label: "Code", mono: true },
                { key: "title", label: "Project" },
                { key: "owner", label: "Owner", align: "right" },
              ]}
              rows={(projects ?? []).map((p) => ({
                code: <CodeLabel code={p.code} />,
                title: p.title,
                owner: (
                  <OwnerRow
                    ws={ws}
                    entity="project"
                    entityId={p.id}
                    ownerId={p.owner_id}
                    people={people}
                  />
                ),
              }))}
            />
          )}
        </CardBody>
      </Card>

      {ctx.aboveWall ? (
        <Card>
          <CardHeader title="Clients" />
          <CardBody>
            {clients.length === 0 ? (
              <EmptyState icon={<Building2 />} title="No clients yet." />
            ) : (
              <DataTable
                columns={[
                  { key: "code", label: "Code", mono: true },
                  { key: "name", label: "Client" },
                  { key: "owner", label: "Owner", align: "right" },
                ]}
                rows={clients.map((c) => ({
                  code: <CodeLabel code={c.code} />,
                  name: clientLabel(c),
                  owner: (
                    <OwnerRow
                      ws={ws}
                      entity="client"
                      entityId={c.id}
                      ownerId={c.owner_id}
                      people={people}
                    />
                  ),
                }))}
              />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
