"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateClientStage } from "@/lib/actions/clients";
import type { ClientStage } from "@/lib/types";
import { STAGE_META, STAGE_ORDER } from "./stage";

// Quick stage mover on the profile header.
export function StageSelect({
  ws,
  clientId,
  stage,
}: {
  ws: string;
  clientId: string;
  stage: ClientStage;
}) {
  const [value, setValue] = useState<ClientStage>(stage);
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Client stage"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ClientStage;
        const prev = value;
        setValue(next);
        startTransition(async () => {
          const res = await updateClientStage(ws, clientId, next);
          if (res.error) {
            setValue(prev);
            toast.error(res.error);
          }
        });
      }}
      className="h-8 rounded-[9px] border border-border bg-surface px-2.5 text-meta font-medium text-text-1 outline-none focus-visible:border-brand"
    >
      {STAGE_ORDER.map((s) => (
        <option key={s} value={s}>
          {STAGE_META[s].label}
        </option>
      ))}
    </select>
  );
}
