"use client";

import { SpaceSection } from "@/components/features/departments/space-section";
import { CollapsibleProjectList } from "@/components/features/departments/collapsible-project-list";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { QuickAddProject } from "@/components/features/departments/quick-add-project";
import { BOARD_COLUMNS } from "@/components/features/projects/types";
import type { CompletionMap, ProjectWithOwner } from "@/components/features/projects/types";

// A list page, grouped by status, which is how the studio reads one in
// ClickUp: a coloured pill per status, its own column header underneath, the
// rows, then a row to add another.
//
// The space page has its own grouped list because it also has folders, lists,
// and dragging between them. A list page has one list and nothing to file
// into, so status is the only grouping that says anything, and this is the
// smaller component that does exactly that.
//
// Empty statuses are left out. On a board an empty column is a place to drop
// something, so it earns its space; in a list it is a heading with nothing
// under it.
export function StatusGroupedList({
  ws,
  slug,
  userId,
  departmentId,
  listId,
  listName,
  projects,
  completion,
  canManage,
}: {
  ws: string;
  slug: string;
  userId: string;
  departmentId: string;
  listId: string;
  listName: string;
  projects: ProjectWithOwner[];
  completion: CompletionMap;
  canManage: boolean;
}) {
  const groups = BOARD_COLUMNS.map((col) => ({
    ...col,
    items: projects.filter((p) => p.status === col.status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <SpaceSection
          key={g.status}
          label={g.label}
          chip={<ProjectStatusChip status={g.status} />}
          count={g.items.length}
        >
          <CollapsibleProjectList
            ws={ws}
            userId={userId}
            projects={g.items}
            completion={completion}
            // The heading is the status, so a column repeating it on every
            // row would be the same word nine times.
            showStatus={false}
            footer={
              canManage ? (
                <QuickAddProject
                  ws={ws}
                  slug={slug}
                  departmentId={departmentId}
                  listId={listId}
                  listName={listName}
                />
              ) : null
            }
          />
        </SpaceSection>
      ))}
    </div>
  );
}
