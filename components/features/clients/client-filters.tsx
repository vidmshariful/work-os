"use client";

import { useRouter } from "next/navigation";
import { SearchField } from "@/components/primitives/field";
import { STAGE_META, STAGE_ORDER } from "./stage";
import type { OwnerOption } from "./queries";

const selectClass =
  "h-8 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 outline-none transition-colors hover:text-text-1 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function ClientFilters({
  ws,
  view,
  q,
  stage,
  origin,
  owner,
  owners,
  aboveWall,
}: {
  ws: string;
  view: string;
  q: string;
  stage: string;
  origin: string;
  owner: string;
  owners: OwnerOption[];
  aboveWall: boolean;
}) {
  const router = useRouter();

  const apply = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    const next = { view, q, stage, origin, owner, ...patch };
    if (next.view === "pipeline") params.set("view", "pipeline");
    if (next.q) params.set("q", next.q);
    if (next.stage) params.set("stage", next.stage);
    if (next.origin) params.set("origin", next.origin);
    if (next.owner) params.set("owner", next.owner);
    const qs = params.toString();
    router.replace(`/${ws}/clients${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        placeholder="Search clients"
        defaultValue={q}
        className="w-[180px]"
        onChange={(e) => apply({ q: e.target.value })}
      />
      <select
        aria-label="Filter by stage"
        className={selectClass}
        value={stage}
        onChange={(e) => apply({ stage: e.target.value })}
      >
        <option value="">All stages</option>
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_META[s].label}
          </option>
        ))}
      </select>
      {aboveWall ? (
        <>
          <select
            aria-label="Filter by origin"
            className={selectClass}
            value={origin}
            onChange={(e) => apply({ origin: e.target.value })}
          >
            <option value="">All origins</option>
            <option value="direct">Direct</option>
            <option value="ghl_video">GHL Video</option>
            <option value="ghl_animation">GHL Animation</option>
          </select>
          <select
            aria-label="Filter by owner"
            className={selectClass}
            value={owner}
            onChange={(e) => apply({ owner: e.target.value })}
          >
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}
