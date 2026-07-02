"use client";

import Link from "next/link";
import { useTransition } from "react";
import { MoreHorizontal, ExternalLink, Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveProject } from "@/lib/actions/projects";

// Trailing actions on a project list row: an Open link that reveals on
// hover, plus an overflow menu. Archive shows only for managers.
export function ProjectRowActions({
  ws,
  projectId,
  canArchive,
  isArchived,
}: {
  ws: string;
  projectId: string;
  canArchive: boolean;
  isArchived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const onArchive = () => {
    startTransition(async () => {
      const res = await archiveProject(ws, projectId);
      if (res.error) toast.error(res.error);
      else toast.success("Project archived.");
    });
  };

  return (
    <>
      <Link
        href={`/${ws}/projects/${projectId}`}
        className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
      >
        Open
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Project actions"
            className="opacity-0 transition-opacity group-hover:opacity-100 aria-expanded:opacity-100"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link href={`/${ws}/projects/${projectId}`}>
              <ExternalLink className="size-4" strokeWidth={1.5} />
              Open
            </Link>
          </DropdownMenuItem>
          {canArchive && !isArchived ? (
            <DropdownMenuItem onSelect={onArchive} disabled={pending}>
              <Archive className="size-4" strokeWidth={1.5} />
              Archive
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
