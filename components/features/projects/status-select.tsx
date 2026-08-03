"use client";

import { useEffect, useRef, useState } from "react";
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
//
// It shows the picked status immediately, like the Status row in the property
// grid below it. That is not decoration: the two sit on the same screen, so
// one of them settling a second later than the other would put two different
// answers to the same question in front of the same person.
export function ProjectStatusSelect({
  ws,
  projectId,
  status,
}: {
  ws: string;
  projectId: string;
  status: ProjectStatus;
}) {
  const [picked, setPicked] = useState<ProjectStatus | null>(null);
  const [pending, setPending] = useState(false);
  const seqRef = useRef(0);

  // The override stands until the server's copy of the page says the same
  // thing, then it steps aside.
  useEffect(() => {
    if (!pending && picked !== null && status === picked) setPicked(null);
  }, [status, picked, pending]);

  const onChange = (value: string) => {
    const next = value as ProjectStatus;
    if (next === (picked ?? status)) return;
    const seq = ++seqRef.current;
    setPicked(next);
    setPending(true);

    void (async () => {
      try {
        const res = await updateProjectStatus(ws, projectId, next);
        if (seqRef.current !== seq) return;
        setPending(false);
        if (res.error) {
          toast.error(res.error);
          setPicked(null);
        }
      } catch {
        if (seqRef.current !== seq) return;
        setPending(false);
        setPicked(null);
        toast.error("The status could not be saved. Check your connection and try again.");
      }
    })();
  };

  return (
    <Select value={picked ?? status} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label="Change project status"
        className="rounded-[9px]"
        data-pending={pending || undefined}
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
