"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import {
  createClientRecord,
  updateClient,
  type ClientFormState,
} from "@/lib/actions/clients";
import type { VClient } from "@/lib/types";
import type { OwnerOption } from "./queries";

const initialState: ClientFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

const ORIGIN_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "ghl_video", label: "GHL Video" },
  { value: "ghl_animation", label: "GHL Animation" },
];

// Create and edit form for client records. Rendered only above the wall or
// for revenue members; the server action re-checks regardless.
export function ClientForm({
  ws,
  owners,
  client,
  canEditOrigin,
}: {
  ws: string;
  owners: OwnerOption[];
  client?: VClient;
  canEditOrigin: boolean;
}) {
  const isEdit = Boolean(client);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateClient : createClientRecord,
    initialState
  );

  useEffect(() => {
    if (state.success) toast.success("Client saved.");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />
      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <Field label="Commercial name" htmlFor="commercial_name">
        <input
          id="commercial_name"
          name="commercial_name"
          required
          defaultValue={client?.commercial_name ?? ""}
          placeholder="Acme Fitness"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="contact_name">
          <input
            id="contact_name"
            name="contact_name"
            defaultValue={client?.contact_name ?? ""}
            placeholder="Jamie Rivera"
            className={inputClass}
          />
        </Field>
        <Field label="Contact email" htmlFor="contact_email">
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={client?.contact_email ?? ""}
            placeholder="jamie@acme.com"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit || canEditOrigin ? (
          <Field
            label="Origin"
            htmlFor="origin"
            hint="Origin is above-wall data. Below the wall it does not exist."
          >
            <select
              id="origin"
              name="origin"
              className={inputClass}
              defaultValue={client?.origin ?? "direct"}
            >
              {ORIGIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Contract value" htmlFor="contract_value">
          <input
            id="contract_value"
            name="contract_value"
            type="number"
            min="0"
            step="100"
            defaultValue={client?.contract_value ?? ""}
            placeholder="12000"
            className={`${inputClass} font-mono tabular`}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner" htmlFor="owner_id">
          <select
            id="owner_id"
            name="owner_id"
            className={inputClass}
            defaultValue={client?.owner_id ?? "none"}
          >
            <option value="none">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            className={inputClass}
            defaultValue={client?.status ?? "active"}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {!isEdit ? (
          <p className="text-[12px] text-text-3">
            Creating a client scaffolds its first project automatically.
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : isEdit ? "Save changes" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
