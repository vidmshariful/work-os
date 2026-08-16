import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Breadcrumbs } from "@/components/primitives/misc";
import {
  ShareDocDialog,
  type DocShareRow,
} from "@/components/features/database/doc-controls";
import { MoveToFolder } from "@/components/features/database/folder-controls";
import { DocFile, DocLink, DocPage, DocTitle } from "@/components/features/database/doc-body";
import { getDocFileUrl } from "@/lib/actions/docs";
import { textPreviewKind } from "@/lib/doc-render";
import type { Doc } from "@/lib/types";

export const metadata: Metadata = { title: "Doc" };

interface ProfileRef {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ ws: string; docId: string }>;
}) {
  const { ws, docId } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: docRow } = await supabase
    .from("docs")
    .select("*")
    .eq("id", docId)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!docRow) notFound();
  const doc = docRow as Doc;

  const [{ data: shareRows }, { data: memberRows }, { data: folderRows }] = await Promise.all([
    supabase
      .from("doc_shares")
      .select("profile_id, can_edit, profile:profiles!profile_id(id, full_name, avatar_url)")
      .eq("doc_id", docId),
    supabase
      .from("memberships")
      .select("profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true),
    // Only folders this person can see, the same rule the table page uses.
    supabase
      .from("db_folders")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id)
      .order("name"),
  ]);

  const shares: DocShareRow[] = (
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

  const isOwner = doc.owner_id === ctx.userId;
  const isManager =
    ctx.membership.archetype === "executive" ||
    ctx.membership.archetype === "domain_manager";
  const myShare = shares.find((s) => s.profile_id === ctx.userId);
  const canEdit =
    isOwner || Boolean(myShare?.can_edit) || (doc.scope === "company" && isManager);

  // Signed URL is minted server-side and expires; the bucket stays private.
  const fileUrl =
    doc.kind === "file" ? (await getDocFileUrl(ws, docId)).url : null;

  // Markdown, CSV, JSON, and plain text render properly rather than in a
  // frame. Read a bounded amount so a huge file cannot stall the page.
  const textKind =
    doc.kind === "file"
      ? textPreviewKind(doc.file_name ?? "", doc.file_type ?? "")
      : null;
  let fileText: string | null = null;
  if (fileUrl && textKind) {
    try {
      const res = await fetch(fileUrl);
      if (res.ok) fileText = (await res.text()).slice(0, 512 * 1024);
    } catch {
      fileText = null;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Database", href: `/${ws}/database` },
          { label: "Docs", href: `/${ws}/database/docs` },
          { label: doc.title },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DocTitle ws={ws} docId={docId} title={doc.title} canEdit={canEdit} />
          <p className="mt-1 flex items-center gap-2 text-sm text-text-2">
            {doc.scope === "company"
              ? "In the company database."
              : "Private to you and the people you share it with."}
            {doc.contributed ? (
              <span className="flex items-center gap-1 rounded-full bg-chip-gray px-2 py-0.5 text-[11px] font-medium text-text-2">
                <Users className="size-3" strokeWidth={1.75} />
                Shared by team
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <MoveToFolder
              ws={ws}
              kind="doc"
              itemId={docId}
              folderId={doc.folder_id}
              folders={(folderRows ?? []) as { id: string; name: string }[]}
            />
          ) : null}
          <ShareDocDialog
            ws={ws}
            docId={docId}
            scope={doc.scope}
            contributed={doc.contributed}
            shares={shares}
            members={members}
            canEdit={canEdit}
          />
        </div>
      </div>

      {doc.kind === "page" ? (
        <DocPage ws={ws} docId={docId} content={doc.content ?? ""} canEdit={canEdit} />
      ) : doc.kind === "file" ? (
        <DocFile
          fileName={doc.file_name ?? "file"}
          fileType={doc.file_type ?? ""}
          url={fileUrl}
          text={fileText}
          textKind={textKind}
        />
      ) : (
        <DocLink url={doc.url ?? ""} />
      )}
    </div>
  );
}
