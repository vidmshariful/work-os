"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProjectStatus } from "@/lib/actions/projects";
import type { ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_OPTIONS } from "./types";

// Status change control on the project header. Rendered only for managers
// or the project owner; the server action checks again.
export function ProjectStatusSelect({
  ws,
  projectId,
  status,
}: {
  ws: string;
  projectId: string;
  status: ProjectStatus;
}) {
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    if (value === status) return;
    startTransition(async () => {
      const res = await updateProjectStatus(
        ws,
        projectId,
        value as ProjectStatus
      );
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label="Change project status"
        className="rounded-[9px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {PROJECT_STATUS_OPTIONS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
