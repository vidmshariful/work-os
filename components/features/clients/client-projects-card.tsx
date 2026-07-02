import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Card, CardHeader } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { ProjectStatusChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/types";

export interface ClientProjectRow {
  id: string;
  code: string;
  title: string;
  status: ProjectStatus;
}

// The work attached to a client. Renders identically on both sides of the
// wall: project titles are brand-blind by design.
export function ClientProjectsCard({
  projects,
  ws,
  canCreateProjects,
}: {
  projects: ClientProjectRow[];
  ws: string;
  canCreateProjects: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Projects"
        action={
          canCreateProjects ? (
            <Link
              href={`/${ws}/projects/new`}
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              New project
            </Link>
          ) : undefined
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet. New work for this client starts here."
          action={
            canCreateProjects ? (
              <Button asChild variant="outline">
                <Link href={`/${ws}/projects/new`}>New project</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div>
          {projects.map((p) => (
            <ListRow
              key={p.id}
              title={p.title}
              subtitle={<CodeLabel code={p.code} />}
              meta={<ProjectStatusChip status={p.status} />}
              trailing={
                <Link
                  href={`/${ws}/projects/${p.id}`}
                  className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
                >
                  Open
                </Link>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}
