import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Breadcrumbs } from "@/components/primitives/misc";
import { TableGrid } from "@/components/features/database/table-grid";
import {
  ShareTableDialog,
  type ShareRow,
} from "@/components/features/database/table-controls";
import { MoveToFolder } from "@/components/features/database/folder-controls";
import { SECRET_PRESENT, type DbField, type DbRow, type DbTable } from "@/lib/types";

export const metadata: Metadata = { title: "Table" };

interface ProfileRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default async function TablePage({
  params,
}: {
  params: Promise<{ ws: string; tableId: string }>;
}) {
  const { ws, tableId } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: tableRow } = await supabase
    .from("db_tables")
    .select("*")
    .eq("id", tableId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!tableRow) notFound();
  const table = tableRow as DbTable;

  const [
    { data: fieldRows },
    { data: rowRows },
    { data: shareRows },
    { data: memberRows },
    { data: folderRows },
  ] = await Promise.all([
      supabase.from("db_fields").select("*").eq("table_id", tableId).order("sort_order"),
      supabase.from("db_rows").select("*").eq("table_id", tableId).order("sort_order"),
      supabase
        .from("db_shares")
        .select("profile_id, can_edit, profile:profiles!profile_id(id, full_name, avatar_url)")
        .eq("table_id", tableId),
      supabase
        .from("memberships")
        .select("profile:profiles!profile_id!inner(id, full_name)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      // Only folders this person can see, so the picker cannot file a table
      // into a folder they have no business knowing about.
      supabase
        .from("db_folders")
        .select("id, name")
        .eq("workspace_id", ctx.workspace.id)
        .order("name"),
    ]);

  const fields = (fieldRows ?? []) as DbField[];

  // A secret never travels to the browser, not even as ciphertext. The cell
  // is replaced by a marker that says only whether something is stored, and
  // the value itself comes back one at a time through revealSecret, which
  // checks access and records the reveal. Sending the ciphertext instead
  // would hand every viewer an offline copy to work on at their leisure.
  const secretIds = new Set(fields.filter((f) => f.type === "secret").map((f) => f.id));
  const rows = ((rowRows ?? []) as DbRow[]).map((r) => {
    if (secretIds.size === 0) return r;
    const values = { ...r.values };
    for (const id of secretIds) {
      if (values[id] !== undefined && values[id] !== null && values[id] !== "") {
        values[id] = SECRET_PRESENT;
      }
    }
    return { ...r, values };
  });
  const shares: ShareRow[] = (
    (shareRows ?? []) as unknown as {
      profile_id: string;
      can_edit: boolean;
      profile: ProfileRef | null;
    }[]
  )
    .filter((s) => s.profile)
    .map((s) => ({
      profile_id: s.profile_id,
      can_edit: s.can_edit,
      name: s.profile!.full_name,
      avatar_url: s.profile!.avatar_url,
    }));
  const members = ((memberRows ?? []) as unknown as { profile: { id: string; full_name: string } }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const isOwner = table.owner_id === ctx.userId;
  const isManager =
    ctx.membership.archetype === "executive" ||
    ctx.membership.archetype === "domain_manager";
  const myShare = shares.find((s) => s.profile_id === ctx.userId);
  const canEdit =
    isOwner || Boolean(myShare?.can_edit) || (table.scope === "company" && isManager);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[{ label: "Database", href: `/${ws}/database` }, { label: table.name }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-body font-semibold"
              style={{ backgroundColor: `${table.color}1A`, color: table.color }}
            >
              {table.name.slice(0, 1).toUpperCase()}
            </span>
            <h1 className="page-title">
              {table.name}
            </h1>
            {table.contributed ? (
              <span className="flex items-center gap-1 rounded-full bg-chip-gray px-2 py-0.5 text-label font-medium text-text-2">
                <Users className="size-3" strokeWidth={1.75} />
                Shared by team
              </span>
            ) : null}
          </div>
          <p className="page-subtitle mt-1">
            {table.description ??
              (table.scope === "company"
                ? "In the company database."
                : "Private to you and the people you share it with.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <MoveToFolder
              ws={ws}
              kind="table"
              itemId={tableId}
              folderId={table.folder_id}
              folders={(folderRows ?? []) as { id: string; name: string }[]}
            />
          ) : null}
          <ShareTableDialog
            ws={ws}
            tableId={tableId}
            scope={table.scope}
            contributed={table.contributed}
            shares={shares}
            members={members}
            canEdit={canEdit}
          />
        </div>
      </div>

      <TableGrid
        ws={ws}
        tableId={tableId}
        fields={fields}
        rows={rows}
        members={members}
        canEdit={canEdit}
      />
    </div>
  );
}
