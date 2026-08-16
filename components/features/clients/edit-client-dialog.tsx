"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import { updateClient, type ClientFormState } from "@/lib/actions/clients";
import type { VClient } from "@/lib/types";
import type { OwnerOption } from "./queries";

const initialState: ClientFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function EditClientDialog({
  ws,
  client,
  owners,
  canEditOrigin,
}: {
  ws: string;
  client: VClient;
  owners: OwnerOption[];
  canEditOrigin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateClient, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Client saved.");
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="ws" value={ws} />
          <input type="hidden" name="id" value={client.id} />
          <Field label="Commercial name" htmlFor="ec_name">
            <input
              id="ec_name"
              name="commercial_name"
              required
              defaultValue={client.commercial_name ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website" htmlFor="ec_web">
              <input id="ec_web" name="website" defaultValue={client.website ?? ""} className={inputClass} />
            </Field>
            <Field label="Total value" htmlFor="ec_value">
              <input
                id="ec_value"
                name="contract_value"
                type="number"
                min="0"
                step="100"
                defaultValue={client.contract_value ?? ""}
                className={`${inputClass} font-mono tabular`}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="HighLevel record" htmlFor="ec_hl">
              <input id="ec_hl" name="highlevel_url" defaultValue={client.highlevel_url ?? ""} className={inputClass} />
            </Field>
            <Field label="Owner" htmlFor="ec_owner">
              <select id="ec_owner" name="owner_id" className={inputClass} defaultValue={client.owner_id ?? "none"}>
                <option value="none">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {canEditOrigin ? (
            <Field label="Origin" htmlFor="ec_origin" hint="Executives only.">
              <select id="ec_origin" name="origin" className={inputClass} defaultValue={client.origin ?? "direct"}>
                <option value="direct">Direct</option>
                <option value="ghl_video">GHL Video</option>
                <option value="ghl_animation">GHL Animation</option>
              </select>
            </Field>
          ) : null}
          {state.error ? (
            <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
