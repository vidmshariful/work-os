import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, FolderKanban, Layers, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { loadCardFields, loadSpaceDirectory } from "@/lib/data/spaces";
import {
  SpaceGlyph,
  SpaceSettingsMenu,
} from "@/components/features/departments/space-settings";
import { Card } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectBoard } from "@/components/features/projects/project-board";
import { ProjectActionsProvider } from "@/components/features/projects/project-actions";
import { isOverdue } from "@/components/features/projects/due-date";
import { SpaceControls } from "@/components/features/departments/space-controls";
import { SpaceGroupedList } from "@/components/features/departments/space-grouped-list";
import { SpaceTable } from "@/components/features/departments/space-table";
import { ProjectCalendar } from "@/components/features/departments/project-calendar";
import {
  NO_LIST,
  UNASSIGNED,
  activeFilterCount,
  applySpaceFilters,
  buildSpaceQuery,
  groupNests,
  groupProjects,
  hasExplicitGroup,
  hasExplicitView,
  parseSpaceFilters,
  parseView,
} from "@/components/features/departments/space-filters";
import {
  NewFolderForm,
  NewListForm,
} from "@/components/features/departments/department-controls";
import type { Department, ProjectFolder, ProjectList } from "@/lib/types";
import { completionFrom } from "@/components/features/projects/types";
import type { MemberOption, ProjectWithOwner } from "@/components/features/projects/types";

export const metadata: Metadata = { title: "Space" };

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws, slug } = await params;
  const sp = await searchParams;
  // List stays the default, so an existing link to a space is unchanged.
  const view = parseView(sp.view);
  const month =
    typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m)
      ? sp.m
      : new Date().toISOString().slice(0, 7);
  const filters = parseSpaceFilters(sp);
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data: deptRow } = await supabase
    .from("departments")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .eq("slug", slug)
    .maybeSingle();
  if (!deptRow) notFound();
  const dept = deptRow as Department;

  const [
    { data: listRows },
    { data: folderRows },
    { data: projectRows },
    { data: progressRows },
    { data: memberRows },
    { data: spaceRows },
    directory,
    cardFields,
  ] = await Promise.all([
      supabase
        .from("project_lists")
        .select("*")
        .eq("department_id", dept.id)
        // Archived lists leave the page the way archived spaces leave the
        // index. Nothing is deleted and nobody loses access.
        .is("archived_at", null)
        .order("sort_order"),
      supabase
        .from("project_folders")
        .select("*")
        .eq("department_id", dept.id)
        .order("sort_order"),
      supabase
        .from("projects")
        .select("*, owner:profiles(id, full_name, avatar_url)")
        .eq("department_id", dept.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      // Progress comes from the view, which already rolls sub-project tasks
      // into their parent. RLS scopes it to what this reader can see.
      supabase.from("v_project_progress").select("*"),
      // Candidates for the table's inline assignee picker.
      supabase
        .from("memberships")
        .select("profile:profiles!profile_id!inner(id, full_name)")
        .eq("workspace_id", ctx.workspace.id)
        .eq("is_active", true),
      // Destinations for "Move to space". departments_select already limits
      // this to spaces the reader belongs to, or everything for an executive,
      // so the menu cannot name a space they are not in.
      supabase
        .from("departments")
        .select("id, name")
        .eq("workspace_id", ctx.workspace.id)
        .order("name"),
      // Only fetched for an executive: the settings panel is theirs alone.
      loadSpaceDirectory(ctx.workspace.id, ctx.capabilities.canSeeAdmin),
      // The choice fields this space carries, and their values, so a board
      // card can show what stage a project is at without opening it. Values
      // come back under the reader's own RLS, the same as the projects do.
      loadCardFields(supabase, ctx.workspace.id, dept.id),
    ]);

  const folders = (folderRows ?? []) as ProjectFolder[];
  const folderRank = new Map(folders.map((f, i) => [f.id, i]));
  // groupProjects emits one section per list in the order it is handed them,
  // so sorting here is what puts each folder's sections together. A list with
  // no folder sorts last, into the loose block under the folders.
  const lists = ((listRows ?? []) as ProjectList[])
    .slice()
    .sort((a, b) => {
      const fa = a.folder_id ? folderRank.get(a.folder_id) ?? 998 : 999;
      const fb = b.folder_id ? folderRank.get(b.folder_id) ?? 998 : 999;
      return fa !== fb ? fa - fb : a.sort_order - b.sort_order;
    });
  const listFolder: Record<string, string | null> = {};
  for (const l of lists) listFolder[l.id] = l.folder_id;
  const allProjects = (projectRows ?? []) as unknown as ProjectWithOwner[];
  const completion = completionFrom(progressRows);

  // Counted over everything in the space, so the pill does not change when
  // the filter it controls is already on.
  const overdueCount = allProjects.filter((p) =>
    isOverdue(p.due_date, p.status)
  ).length;

  // Filtering and sorting happen here, on the server, so the browser receives
  // only the rows it will draw.
  const { visible, contextIds, matchedCount } = applySpaceFilters(
    allProjects,
    filters,
    completion,
    (ctx.settings.week_start_day ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    new Map(((listRows ?? []) as ProjectList[]).map((l) => [l.id, l.name]))
  );
  const projects = visible;
  const filterCount = activeFilterCount(filters);

  // Only people who actually own something here, so the menu never lists the
  // whole workspace. Unassigned is a real choice, not the absence of one.
  const assigneeOptions = [
    ...new Map(
      allProjects
        .filter((p) => p.owner)
        .map((p) => [p.owner!.id, { value: p.owner!.id, label: p.owner!.full_name }])
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  if (allProjects.some((p) => !p.owner_id)) {
    assigneeOptions.push({ value: UNASSIGNED, label: "Unassigned" });
  }
  const listOptions = [
    ...lists.map((l) => ({ value: l.id, label: l.name })),
    ...(allProjects.some((p) => !p.list_id)
      ? [{ value: NO_LIST, label: "No list" }]
      : []),
  ];

  // Grouping runs after filtering, so a section only ever holds rows that
  // survived the bar.
  const nests = groupNests(filters.group);
  const groups = groupProjects(projects, filters.group, lists);
  // Built from every project in the space, not just the visible ones, so a
  // breadcrumb still resolves when the parent is filtered out or grouped
  // somewhere else.
  const parentOf = new Map(
    allProjects.map((p) => [p.id, { id: p.id, code: p.code, title: p.title }])
  );
  const listNames = new Map(lists.map((l) => [l.id, l.name]));
  const members = ((memberRows ?? []) as unknown as { profile: MemberOption }[])
    .map((m) => m.profile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const canManage = ctx.capabilities.canCreateProjects;
  const canAddList = ctx.capabilities.canAssignTasks;
  const isExec = ctx.capabilities.canSeeAdmin;
  // Everything the row menu and the bulk bar need, resolved once here so no
  // client component queries for it.
  const actionScope = {
    ws,
    viewerId: ctx.userId,
    canManage,
    canDelete: ctx.capabilities.canDeleteProjects,
    lists: lists.map((l) => ({ id: l.id, name: l.name })),
    spaces: ((spaceRows ?? []) as { id: string; name: string }[]).map((d) => ({
      id: d.id,
      name: d.name,
    })),
    members,
  };
  // Counted over every project in the space, not the filtered view. The list
  // delete confirmation quotes this number, so it has to be the real one.
  const listCounts: Record<string, number> = {};
  for (const l of lists) listCounts[l.id] = 0;
  for (const p of allProjects) {
    if (p.list_id && listCounts[p.list_id] !== undefined) listCounts[p.list_id] += 1;
  }

  const base = `/${ws}/departments/${slug}`;
  // Every link keeps the filters that are already on, so switching view or
  // toggling the pill never silently resets the rest of the bar.
  const href = (opts: { view?: string; due?: string | null }) => {
    const qs = buildSpaceQuery({
      ...filters,
      due: (opts.due === undefined ? filters.due : opts.due) as never,
      view: opts.view ?? view,
    });
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: `/${ws}/departments` },
          { label: dept.name },
        ]}
      />

      {dept.archived_at ? (
        <div className="flex items-start gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-text-2">
          <Archive className="mt-px size-4 shrink-0 text-text-3" strokeWidth={1.5} />
          <span>
            This space is archived. It is out of the sidebar and the index,
            and everything in it still works. Restore it from the space
            settings danger zone.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SpaceGlyph
            name={dept.name}
            icon={dept.icon}
            color={dept.accent_color}
            size={40}
            className="rounded-[11px]"
          />
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
              {dept.name}
            </h1>
            {dept.description ? (
              <p className="mt-0.5 text-sm text-text-2">{dept.description}</p>
            ) : null}
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-text-2">
              <span>
                {allProjects.length} project{allProjects.length === 1 ? "" : "s"}{" "}
                across {lists.length} list{lists.length === 1 ? "" : "s"}.
              </span>
              {/* Hidden at zero: an empty red pill would read as a problem.
                  It drives the same due filter the bar exposes, so the two
                  stay in sync rather than fighting each other. */}
              {overdueCount > 0 ? (
                <Link
                  href={href({ due: filters.due === "overdue" ? null : "overdue" })}
                  aria-pressed={filters.due === "overdue"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors",
                    filters.due === "overdue"
                      ? "bg-danger text-white"
                      : "bg-danger-soft text-danger hover:bg-danger hover:text-white"
                  )}
                >
                  {overdueCount} overdue
                  {filters.due === "overdue" ? (
                    <X className="size-3.5" strokeWidth={2} />
                  ) : null}
                </Link>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAddList ? (
            <>
              <NewFolderForm ws={ws} departmentId={dept.id} slug={slug} />
              <NewListForm ws={ws} departmentId={dept.id} slug={slug} />
            </>
          ) : null}
          {canManage ? (
            <Button asChild>
              <Link href={`/${ws}/projects/new?department=${dept.id}`}>
                <Plus />
                New project
              </Link>
            </Button>
          ) : null}
          {/* Executive only, and nothing else belongs in this menu yet, so a
              non-executive gets no menu rather than an empty one. */}
          {isExec ? (
            <SpaceSettingsMenu
              ws={ws}
              space={dept}
              members={directory.membersByDept.get(dept.id) ?? []}
              executives={directory.executives}
              candidates={directory.everyone}
              projectCount={allProjects.length}
              listCount={lists.length}
            />
          ) : null}
        </div>
      </div>

      {/* Row actions, bulk selection, and the keyboard layer are shared by
          everything below, including the control bar, whose search box is
          what the "/" shortcut reaches for. Switching view keeps a
          selection, minus anything the new view does not draw. */}
      <ProjectActionsProvider scope={actionScope} rows={projects}>
      {/* Always rendered: it owns the view tabs now, and an empty space
          still needs a way to reach Board or Calendar. The filter row inside
          it is what depends on there being something to filter. */}
      <SpaceControls
        base={base}
        view={view}
        filters={filters}
        assignees={assigneeOptions}
        lists={listOptions}
        userId={ctx.userId}
        slug={slug}
        groupFromUrl={hasExplicitGroup(sp)}
        viewFromUrl={hasExplicitView(sp)}
        hasProjects={allProjects.length > 0}
      />

      {filterCount > 0 && matchedCount === 0 ? (
        // The space is not empty, the filter is. Say so, and offer the way
        // back. Worded to match the other empty states: what is true, then
        // the one action that changes it.
        <Card>
          <EmptyState
            icon={<Search />}
            title="No projects match these filters. Clearing them brings the space back."
            action={
              <Button asChild variant="outline">
                <Link href={view === "board" ? `${base}?view=board` : base}>
                  Clear filters
                </Link>
              </Button>
            }
          />
        </Card>
      ) : lists.length === 0 ? (
        // No lists at all. A list is the thing projects get filed into, so
        // that is the action, even when some projects already exist.
        <Card>
          <EmptyState
            icon={<Layers />}
            title={
              allProjects.length > 0
                ? `This space has ${allProjects.length} project${
                    allProjects.length === 1 ? "" : "s"
                  } and nowhere to file them. Add a list to group the work.`
                : "This space has no lists yet. A list is a bucket for work, like Custom or Premade."
            }
            action={
              canAddList ? (
                <NewListForm ws={ws} departmentId={dept.id} slug={slug} />
              ) : (
                <p className="text-[12.5px] text-text-3">
                  Ask a team lead or a manager to add one.
                </p>
              )
            }
          />
        </Card>
      ) : allProjects.length === 0 ? (
        // Lists exist and nothing is in them. Different problem, different
        // action: the work, not the filing.
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={`${lists.length} list${
              lists.length === 1 ? "" : "s"
            } ready and no projects yet. Start one and it lands in the first list.`}
            action={
              canManage ? (
                <Button asChild>
                  <Link href={`/${ws}/projects/new?department=${dept.id}&list=${lists[0].id}`}>
                    New project
                  </Link>
                </Button>
              ) : (
                <p className="text-[12.5px] text-text-3">
                  Ask a manager to start the first one.
                </p>
              )
            }
          />
        </Card>
      ) : view === "table" ? (
        <SpaceTable
          ws={ws}
          base={base}
          userId={ctx.userId}
          filters={filters}
          projects={projects}
          completion={completion}
          listNames={listNames}
          members={members}
          canManage={canManage}
          viewerId={ctx.userId}
          contextIds={contextIds}
        />
      ) : view === "calendar" ? (
        // The same month grid the list page uses, scoped to the whole space.
        <ProjectCalendar
          ws={ws}
          base={href({ view: "calendar" })}
          month={month}
          projects={projects.filter((p) => !contextIds.has(p.id))}
        />
      ) : view === "board" ? (
        // The board groups every project in the space by status, so it cuts
        // across the lists rather than nesting inside them. Context parents
        // are dropped here: a board has no "beneath", so a non-matching card
        // would read as a result rather than as context.
        <ProjectBoard
          fields={cardFields.fields}
          fieldValues={cardFields.values}
          ws={ws}
          projects={projects.filter((p) => !contextIds.has(p.id))}
          completion={completion}
        />
      ) : (
        <SpaceGroupedList
          ws={ws}
          slug={slug}
          userId={ctx.userId}
          groups={groups}
          group={filters.group}
          completion={completion}
          contextIds={[...contextIds]}
          filterActive={filterCount > 0}
          nested={nests}
          parentOf={[...parentOf.values()]}
          canReorderLists={canAddList}
          canManage={canManage}
          departmentId={dept.id}
          lists={lists.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
          folders={folders.map((f) => ({ id: f.id, name: f.name, color: f.color }))}
          listFolder={listFolder}
          listCounts={listCounts}
          spaces={actionScope.spaces}
          sectionActions={Object.fromEntries(
            lists.map((l) => [
              l.id,
              // The quick add row covers the common case. This stays for the
              // times a project needs a client, a template, or dates set at
              // creation, which one text field cannot ask for.
              canManage ? (
                <Link
                  key={l.id}
                  href={`/${ws}/projects/new?department=${dept.id}&list=${l.id}`}
                  className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover/section:opacity-100"
                >
                  New with details
                </Link>
              ) : null,
            ])
          )}
          emptyNote={{
            [NO_LIST]:
              "Nothing is sitting outside a list, which is how it should be.",
          }}
        />
      )}
      </ProjectActionsProvider>
    </div>
  );
}
