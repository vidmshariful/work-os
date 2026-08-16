import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FolderKanban, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { loadSpaceDirectory } from "@/lib/data/spaces";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import {
  NewSpaceButton,
  SpaceGlyph,
  SpaceSettingsMenu,
} from "@/components/features/departments/space-settings";
import type { Department } from "@/lib/types";

export const metadata: Metadata = { title: "Spaces" };

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  // Everything in the settings panel is executive gated, so the data behind
  // it is only fetched for one.
  const isExec = ctx.capabilities.canSeeAdmin;

  // RLS returns only departments the viewer can see.
  const [
    { data: deptRows },
    { data: projRows },
    { data: listRows },
    directory,
    { data: execRows },
  ] = await Promise.all([
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
      loadSpaceDirectory(ctx.workspace.id, isExec),
      // Named in the empty state, so someone with no spaces is told who can
      // let them in rather than to find "an admin". Readable by any member.
      supabase
        .from("memberships")
        .select("profile:profiles!profile_id!inner(full_name)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("archetype", "executive")
        .eq("is_active", true),
    ]);

  const all = (deptRows ?? []) as Department[];
  // Archiving is a UI state, not a permission, so it is applied here rather
  // than in a policy. An executive still sees archived spaces, in their own
  // group, because otherwise nobody could bring one back.
  const departments = all.filter((d) => !d.archived_at);
  const archived = isExec ? all.filter((d) => d.archived_at) : [];

  const projectCount = new Map<string, number>();
  for (const p of (projRows ?? []) as { department_id: string | null }[]) {
    if (p.department_id)
      projectCount.set(p.department_id, (projectCount.get(p.department_id) ?? 0) + 1);
  }
  const listCount = new Map<string, number>();
  for (const l of (listRows ?? []) as { department_id: string }[]) {
    listCount.set(l.department_id, (listCount.get(l.department_id) ?? 0) + 1);
  }

  const execNames = ((execRows ?? []) as unknown as {
    profile: { full_name: string };
  }[])
    .map((r) => r.profile.full_name)
    .sort((a, b) => a.localeCompare(b));
  const executiveNames =
    execNames.length === 0
      ? ""
      : execNames.length === 1
        ? execNames[0]
        : `${execNames.slice(0, -1).join(", ")} or ${execNames[execNames.length - 1]}`;

  const card = (d: Department, muted: boolean) => (
    // The whole card is a link, but the menu inside it must not navigate, so
    // the link is an overlay under the menu rather than a wrapper around it.
    <Card
      key={d.id}
      className="relative p-5 transition-colors hover:border-border-strong"
    >
      <Link
        href={`/${ws}/departments/${d.slug}`}
        aria-label={`Open ${d.name}`}
        className="absolute inset-0 rounded-[14px]"
      />
      <div className={muted ? "opacity-60" : undefined}>
        <div className="flex items-start gap-2.5">
          <SpaceGlyph name={d.name} icon={d.icon} color={d.accent_color} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lead font-semibold text-text-1">
                {d.name}
              </span>
              {d.is_default ? (
                <span className="rounded-[6px] bg-brand-soft px-1.5 py-0.5 text-label font-medium text-brand">
                  Default
                </span>
              ) : null}
              {d.archived_at ? (
                <span className="rounded-[6px] bg-chip-gray px-1.5 py-0.5 text-label font-medium text-text-3">
                  Archived
                </span>
              ) : null}
            </div>
            {d.description ? (
              <p className="mt-0.5 line-clamp-2 text-meta text-text-2">
                {d.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-meta text-text-2">
          <span className="flex items-center gap-1.5">
            <FolderKanban className="size-4 text-text-3" strokeWidth={1.5} />
            <span className="font-mono tabular">{projectCount.get(d.id) ?? 0}</span>{" "}
            projects
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="size-4 text-text-3" strokeWidth={1.5} />
            <span className="font-mono tabular">{listCount.get(d.id) ?? 0}</span>{" "}
            lists
          </span>
        </div>
      </div>
      {isExec ? (
        <div className="absolute right-3 top-3 z-10">
          <SpaceSettingsMenu
            ws={ws}
            space={d}
            members={directory.membersByDept.get(d.id) ?? []}
            executives={directory.executives}
            candidates={directory.everyone}
            projectCount={projectCount.get(d.id) ?? 0}
            listCount={listCount.get(d.id) ?? 0}
          />
        </div>
      ) : null}
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">
            Spaces
          </h1>
          <p className="page-subtitle mt-1">
            Each space is an area of the studio. You see the ones you belong to.
          </p>
        </div>
        {isExec ? <NewSpaceButton ws={ws} /> : null}
      </div>

      {departments.length === 0 && archived.length === 0 ? (
        // Not "no results". Spaces are membership based, so an empty index
        // means nobody has added this person to one yet, and the useful
        // thing to say is who can fix that.
        <Card>
          <EmptyState
            className="py-16"
            icon={<Building2 />}
            title={
              isExec
                ? "No spaces yet. Create the first one and it becomes the default."
                : "You are not in any space yet. Spaces are membership based: you see a space once someone adds you to it, and until then its projects are not visible to you."
            }
            action={
              isExec ? (
                <NewSpaceButton ws={ws} />
              ) : (
                <p className="max-w-xs text-meta text-text-3">
                  Ask an executive to add you. In Vidiosa that is{" "}
                  {executiveNames || "whoever runs the workspace"}.
                </p>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => card(d, false))}
        </div>
      )}

      {archived.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-body font-semibold text-text-1">Archived</h2>
            <p className="text-meta text-text-2">
              Out of the sidebar and out of the way. Nothing was deleted, and
              nobody lost access.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((d) => card(d, true))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
