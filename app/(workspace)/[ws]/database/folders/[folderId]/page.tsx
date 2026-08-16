import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, FolderOpen, KeyRound, Link2, Rows3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import {
  DeleteFolderButton,
  FolderPeopleDialog,
} from "@/components/features/database/folder-controls";
import type { ShareRow } from "@/components/features/database/table-controls";
import type { DbFolder, DbTable, Doc } from "@/lib/types";

export const metadata: Metadata = { title: "Folder" };

interface ProfileRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default async function FolderPage({
  params,
}: {
  params: Promise<{ ws: string; folderId: string }>;
}) {
  const { ws, folderId } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: folderRow } = await supabase
    .from("db_folders")
    .select("*")
    .eq("id", folderId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!folderRow) notFound();
  const folder = folderRow as DbFolder;

  // Every read below runs under the caller's own login. A table filed here
  // that they cannot see does not come back, so the count on this page is
  // their count, not the owner's.
  const [
    { data: tableRows },
    { data: docRows },
    { data: shareRows },
    { data: memberRows },
    { data: fieldRows },
    { data: rowCounts },
  ] = await Promise.all([
    supabase.from("db_tables").select("*").eq("folder_id", folderId).order("name"),
    supabase.from("docs").select("*").eq("folder_id", folderId).order("title"),
    supabase
      .from("db_folder_shares")
      .select("profile_id, can_edit, profile:profiles!profile_id(id, full_name, avatar_url)")
      .eq("folder_id", folderId),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    supabase.from("db_fields").select("table_id, type").eq("type", "secret"),
    supabase.from("db_rows").select("table_id"),
  ]);

  const tables = (tableRows ?? []) as DbTable[];
  const docs = (docRows ?? []) as Doc[];
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

  const withSecrets = new Set(
    ((fieldRows ?? []) as { table_id: string }[]).map((f) => f.table_id)
  );
  const counts = new Map<string, number>();
  for (const r of (rowCounts ?? []) as { table_id: string }[]) {
    counts.set(r.table_id, (counts.get(r.table_id) ?? 0) + 1);
  }

  const isOwner = folder.owner_id === ctx.userId;
  const isManager =
    ctx.membership.archetype === "executive" ||
    ctx.membership.archetype === "domain_manager";
  const mine = shares.find((s) => s.profile_id === ctx.userId);
  const canEdit =
    isOwner || Boolean(mine?.can_edit) || (folder.scope === "company" && isManager);
  const itemCount = tables.length + docs.length;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[{ label: "Database", href: `/${ws}/database` }, { label: folder.name }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-[9px]"
              style={{ backgroundColor: `${folder.color}1A`, color: folder.color }}
            >
              <FolderOpen className="size-4" strokeWidth={1.75} />
            </span>
            <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
              {folder.name}
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-2">
            {folder.description ??
              (folder.scope === "company"
                ? "In the company database."
                : "Private to you and the people you give it to.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FolderPeopleDialog
            ws={ws}
            folderId={folderId}
            scope={folder.scope}
            shares={shares}
            members={members}
            canEdit={canEdit}
            itemCount={itemCount}
          />
          {isOwner || isManager ? (
            <DeleteFolderButton ws={ws} folderId={folderId} itemCount={itemCount} />
          ) : null}
        </div>
      </div>

      {itemCount === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderOpen />}
            title="Nothing filed here yet. Open a table or a document and pick this folder to move it in."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => (
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
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-text-2">
                        {t.description}
                      </p>
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
                </div>
              </Card>
            </Link>
          ))}
          {docs.map((d) => (
            <Link key={d.id} href={`/${ws}/database/docs/${d.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-border-strong">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ backgroundColor: `${d.color}1A`, color: d.color }}
                  >
                    {d.kind === "link" ? (
                      <Link2 className="size-4" strokeWidth={1.75} />
                    ) : (
                      <FileText className="size-4" strokeWidth={1.75} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-semibold text-text-1">
                      {d.title}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-text-2">
                      {d.kind === "link" ? "Link" : d.kind === "file" ? "File" : "Page"}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
