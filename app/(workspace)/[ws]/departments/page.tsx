import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FolderKanban, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import type { Department } from "@/lib/types";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  // RLS returns only departments the viewer can see.
  const [{ data: deptRows }, { data: projRows }, { data: listRows }] =
    await Promise.all([
      supabase
        .from("departments")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
      supabase
        .from("projects")
        .select("department_id")
        .eq("workspace_id", ctx.workspace.id)
        .neq("status", "archived"),
      supabase.from("project_lists").select("department_id"),
    ]);

  const departments = (deptRows ?? []) as Department[];
  const projectCount = new Map<string, number>();
  for (const p of (projRows ?? []) as { department_id: string | null }[]) {
    if (p.department_id)
      projectCount.set(p.department_id, (projectCount.get(p.department_id) ?? 0) + 1);
  }
  const listCount = new Map<string, number>();
  for (const l of (listRows ?? []) as { department_id: string }[]) {
    listCount.set(l.department_id, (listCount.get(l.department_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          Spaces
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Each space is an area of the studio. You see the ones you belong to.
        </p>
      </div>

      {departments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title="You are not part of any department yet. An admin can add you to one."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <Link key={d.id} href={`/${ws}/departments/${d.slug}`}>
              <Card className="p-5 transition-colors hover:border-border-strong">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 items-center justify-center rounded-[10px] text-sm font-semibold"
                    style={{
                      backgroundColor: `${d.accent_color}1A`,
                      color: d.accent_color,
                    }}
                  >
                    {d.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-text-1">
                      {d.name}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4 text-[12.5px] text-text-2">
                  <span className="flex items-center gap-1.5">
                    <FolderKanban className="size-4 text-text-3" strokeWidth={1.5} />
                    <span className="font-mono tabular">
                      {projectCount.get(d.id) ?? 0}
                    </span>{" "}
                    projects
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-4 text-text-3" strokeWidth={1.5} />
                    <span className="font-mono tabular">
                      {listCount.get(d.id) ?? 0}
                    </span>{" "}
                    lists
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
