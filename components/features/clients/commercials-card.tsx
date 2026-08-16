"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import {
  saveProjectCommercials,
  type IntakeActionState,
} from "@/lib/actions/project-intake";
import type { ProjectCommercials } from "@/lib/types";

const initialState: IntakeActionState = { error: null };

const inputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand";

// Pricing and invoice terms for one project. Rendered only for executives
// and the assigned manager; RLS returns zero rows to everyone else, so this
// component is never even mounted for the production team.
export function CommercialsPanel({
  ws,
  projectId,
  clientId,
  commercials,
  canEdit,
}: {
  ws: string;
  projectId: string;
  clientId: string | null;
  commercials: ProjectCommercials | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveProjectCommercials,
    initialState
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.success) {
      toast.success(state.success);
      setEditing(false);
    }
  }, [state]);

  if (editing && canEdit) {
    return (
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="ws" value={ws} />
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="client_id" value={clientId ?? ""} />
        <label className="text-meta font-medium text-text-2" htmlFor={`price-${projectId}`}>
          Price
        </label>
        <input
          id={`price-${projectId}`}
          name="price"
          type="number"
          min="0"
          step="50"
          defaultValue={commercials?.price ?? ""}
          placeholder="9500"
          className={`${inputClass} font-mono tabular`}
        />
        <label className="text-meta font-medium text-text-2" htmlFor={`terms-${projectId}`}>
          Invoice terms
        </label>
        <input
          id={`terms-${projectId}`}
          name="invoice_terms"
          defaultValue={commercials?.invoice_terms ?? ""}
          placeholder="50% upfront, 50% on delivery"
          className={inputClass}
        />
        <textarea
          name="notes"
          rows={2}
          defaultValue={commercials?.notes ?? ""}
          placeholder="Billing notes, optional"
          className="w-full rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand"
        />
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-h2 font-semibold text-text-1 tabular">
          {commercials?.price != null ? fmtMoney(Number(commercials.price)) : "—"}
        </span>
        {canEdit ? (
          <Button variant="ghost" size="icon-xs" aria-label="Edit commercials" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        ) : null}
      </div>
      <p className="text-meta text-text-2">
        {commercials?.invoice_terms ?? "No invoice terms set."}
      </p>
      {commercials?.notes ? (
        <p className="text-meta text-text-3">{commercials.notes}</p>
      ) : null}
      <p className="mt-1 text-label text-text-3">
        Visible to executives and the assigned manager only.
      </p>
    </div>
  );
}
