import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Link2, Upload, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { NewDocDialog } from "@/components/features/database/doc-controls";
import { DbTabs } from "@/components/features/database/db-tabs";
import { TimeAgo } from "@/components/primitives/local-time";
import type { Doc } from "@/lib/types";

export const metadata: Metadata = { title: "Docs" };

const KIND_META = {
  page: { label: "Page", Icon: FileText },
  file: { label: "File", Icon: Upload },
  link: { label: "Link", Icon: Link2 },
} as const;

export default async function DocsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data } = await supabase
    .from("docs")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("updated_at", { ascending: false });
  const docs = (data ?? []) as Doc[];

  const company = docs.filter((d) => d.scope === "company");
  const mine = docs.filter((d) => d.scope === "personal" && d.owner_id === ctx.userId);
  const shared = docs.filter((d) => d.scope === "personal" && d.owner_id !== ctx.userId);

  const Grid = ({ items }: { items: Doc[] }) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((d) => {
        const { label, Icon } = KIND_META[d.kind];
        return (
          <Link key={d.id} href={`/${ws}/database/docs/${d.id}`}>
            <Card className="h-full p-5 transition-colors hover:border-border-strong">
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ backgroundColor: `${d.color}1A`, color: d.color }}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-text-1">{d.title}</div>
                  <div className="mt-0.5 text-[12px] text-text-3">
                    {label} · updated <TimeAgo at={d.updated_at} />
                  </div>
                </div>
              </div>
              {d.contributed ? (
                <div className="mt-4 flex items-center gap-1.5 text-[12px] text-text-2">
                  <Users className="size-3.5" strokeWidth={1.5} />
                  Shared by team
                </div>
              ) : null}
            </Card>
          </Link>
        );
      })}
    </div>
  );

  const Section = ({ title, hint, items }: { title: string; hint: string; items: Doc[] }) =>
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
          <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Docs</h1>
          <p className="mt-1 text-sm text-text-2">
            Pages written here, uploaded files, and linked documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DbTabs ws={ws} active="docs" />
          <NewDocDialog ws={ws} />
        </div>
      </div>

      {docs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="No docs yet. Write a page, upload a file, or link one."
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
            title="My docs"
            hint="Private to you until you share or add them to the company database."
            items={mine}
          />
          <Section
            title="Shared with me"
            hint="Docs other people shared with you directly."
            items={shared}
          />
        </>
      )}
    </div>
  );
}
