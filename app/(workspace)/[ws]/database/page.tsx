import type { Metadata } from "next";
import Link from "next/link";
import { Database, Folder, KeyRound, Rows3, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { NewTableDialog } from "@/components/features/database/table-controls";
import { NewFolderDialog } from "@/components/features/database/folder-controls";
import { DbTabs } from "@/components/features/database/db-tabs";
import type { DbFolder, DbTable } from "@/lib/types";

export const metadata: Metadata = { title: "Database" };

export default async function DatabasePage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // RLS returns only tables you own, that are shared with you, that live in
  // the company database, or that sit in a folder you were given. Same for
  // the folders themselves.
  const [
    { data: tableRows },
    { data: rowCounts },
    { data: folderRows },
    { data: docRows },
    { data: secretFields },
  ] = await Promise.all([
    supabase
      .from("db_tables")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false }),
    supabase.from("db_rows").select("table_id"),
    supabase
      .from("db_folders")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("name"),
    // Only the folder column, to count what is filed where. The documents
    // themselves have their own page.
    supabase.from("docs").select("id, folder_id").eq("workspace_id", ctx.workspace.id),
    supabase.from("db_fields").select("table_id").eq("type", "secret"),
  ]);

  const tables = (tableRows ?? []) as DbTable[];
  const folders = (folderRows ?? []) as DbFolder[];
  const counts = new Map<string, number>();
  for (const r of (rowCounts ?? []) as { table_id: string }[]) {
    counts.set(r.table_id, (counts.get(r.table_id) ?? 0) + 1);
  }
  const withSecrets = new Set(
    ((secretFields ?? []) as { table_id: string }[]).map((f) => f.table_id)
  );

  // What each folder holds, counted from what this person can actually see.
  const filed = new Map<string, number>();
  for (const t of tables) {
    if (t.folder_id) filed.set(t.folder_id, (filed.get(t.folder_id) ?? 0) + 1);
  }
  for (const d of (docRows ?? []) as { id: string; folder_id: string | null }[]) {
    if (d.folder_id) filed.set(d.folder_id, (filed.get(d.folder_id) ?? 0) + 1);
  }

  // A table inside a folder is listed on the folder's page, not here, or the
  // same table would appear twice on one screen.
  const loose = tables.filter((t) => !t.folder_id);
  const company = loose.filter((t) => t.scope === "company");
  const mine = loose.filter((t) => t.scope === "personal" && t.owner_id === ctx.userId);
  const shared = loose.filter((t) => t.scope === "personal" && t.owner_id !== ctx.userId);

  const Grid = ({ items }: { items: DbTable[] }) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((t) => (
        <Link key={t.id} href={`/${ws}/database/${t.id}`}>
          <Card className="h-full p-5 transition-colors hover:border-border-strong">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold"
                style={{ backgroundColor: `${t.color}1A`, color: t.color }}
              >
                {t.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-semibold text-text-1">{t.name}</div>
                {t.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-text-2">{t.description}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-[12px] text-text-3">
              <span className="flex items-center gap-1.5">
                <Rows3 className="size-3.5" strokeWidth={1.5} />
                <span className="font-mono tabular">{counts.get(t.id) ?? 0}</span> rows
              </span>
              {withSecrets.has(t.id) ? (
                <span className="flex items-center gap-1.5 text-text-2">
                  <KeyRound className="size-3.5" strokeWidth={1.5} />
                  Holds passwords
                </span>
              ) : null}
              {t.contributed ? (
                <span className="flex items-center gap-1.5 text-text-2">
                  <Users className="size-3.5" strokeWidth={1.5} />
                  Shared by team
                </span>
              ) : null}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );

  const Section = ({
    title,
    hint,
    items,
  }: {
    title: string;
    hint: string;
    items: DbTable[];
  }) =>
    items.length === 0 ? null : (
      <section>
        <div className="mb-2">
          <h2 className="text-[15px] font-semibold text-text-1">{title}</h2>
          <p className="text-[12.5px] text-text-2">{hint}</p>
        </div>
        <Grid items={items} />
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Database</h1>
          <p className="mt-1 text-sm text-text-2">
            Tables, documents and credentials. Folders decide who sees what.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DbTabs ws={ws} active="tables" />
          <NewFolderDialog ws={ws} />
          <NewTableDialog ws={ws} />
        </div>
      </div>

      {folders.length > 0 ? (
        <section>
          <div className="mb-2">
            <h2 className="text-[15px] font-semibold text-text-1">Folders</h2>
            <p className="text-[12.5px] text-text-2">
              Give someone a folder and they get everything filed in it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {folders.map((f) => (
              <Link key={f.id} href={`/${ws}/database/folders/${f.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-border-strong">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                      style={{ backgroundColor: `${f.color}1A`, color: f.color }}
                    >
                      <Folder className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-text-1">
                        {f.name}
                      </div>
                      <div className="text-[12px] text-text-3">
                        <span className="font-mono tabular">{filed.get(f.id) ?? 0}</span> item
                        {(filed.get(f.id) ?? 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {tables.length === 0 && folders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Database />}
            title="No tables yet. Create one to start tracking something."
          />
        </Card>
      ) : (
        <>
          <Section
            title="Company database"
            hint="Visible to everyone in the workspace."
            items={company}
          />
          <Section
            title="My tables"
            hint="Private to you until you share or add them to the company database."
            items={mine}
          />
          <Section
            title="Shared with me"
            hint="Tables other people shared with you directly."
            items={shared}
          />
        </>
      )}
    </div>
  );
}
