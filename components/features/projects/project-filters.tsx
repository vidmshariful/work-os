"use client";

import { useRouter } from "next/navigation";
import type { MemberOption } from "./types";
import { PROJECT_STATUS_OPTIONS } from "./types";

const selectClass =
  "h-8 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 outline-none transition-colors hover:text-text-1 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// Status and owner filters for the projects screen. Selection rewrites the
// searchParams, so the server re-renders the filtered set.
export function ProjectFilters({
  ws,
  view,
  status,
  owner,
  members,
}: {
  ws: string;
  view: "list" | "board";
  status: string;
  owner: string;
  members: MemberOption[];
}) {
  const router = useRouter();

  const apply = (nextStatus: string, nextOwner: string) => {
    const params = new URLSearchParams();
    if (view !== "list") params.set("view", view);
    if (nextStatus) params.set("status", nextStatus);
    if (nextOwner) params.set("owner", nextOwner);
    const qs = params.toString();
    router.replace(`/${ws}/projects${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Filter by status"
        className={selectClass}
        value={status}
        onChange={(e) => apply(e.target.value, owner)}
      >
        <option value="">All statuses</option>
        {PROJECT_STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by owner"
        className={selectClass}
        value={owner}
        onChange={(e) => apply(status, e.target.value)}
      >
        <option value="">All owners</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}
