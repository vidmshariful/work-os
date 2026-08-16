"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/primitives/field";
import {
  onboardPerson,
  offboardPerson,
  updateReportsTo,
  type TeamActionState,
} from "@/lib/actions/team";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { ARCHETYPE_META, ARCHETYPES } from "./labels";

const initialState: TeamActionState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function OnboardDialog({
  ws,
  members,
}: {
  ws: string;
  members: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(onboardPerson, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Add person
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Onboard a person</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="ws" value={ws} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="ob_name">
              <input id="ob_name" name="full_name" required className={inputClass} placeholder="Ayesha Khan" />
            </Field>
            <Field label="Email" htmlFor="ob_email">
              <input id="ob_email" name="email" type="email" required className={inputClass} placeholder="ayesha@vidiosa.com" />
            </Field>
          </div>
          <Field label="Temporary password" htmlFor="ob_password" hint="They should change it after first sign in.">
            <input id="ob_password" name="password" type="text" required minLength={8} className={`${inputClass} font-mono`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="ob_role">
              <select id="ob_role" name="role" required className={inputClass} defaultValue="animator">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Archetype" htmlFor="ob_archetype">
              <select id="ob_archetype" name="archetype" required className={inputClass} defaultValue="contributor">
                {ARCHETYPES.map((a) => (
                  <option key={a} value={a}>
                    {ARCHETYPE_META[a].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wall side" htmlFor="ob_wall" hint="Below the wall, client identity does not exist.">
              <select id="ob_wall" name="wall_side" required className={inputClass} defaultValue="below">
                <option value="below">Below</option>
                <option value="above">Above</option>
              </select>
            </Field>
            <Field label="Reports to" htmlFor="ob_reports">
              <select id="ob_reports" name="reports_to" className={inputClass} defaultValue="">
                <option value="">Nobody</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {state.error ? (
            <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Onboarding" : "Onboard"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReportsToSelect({
  ws,
  profileId,
  reportsTo,
  members,
}: {
  ws: string;
  profileId: string;
  reportsTo: string | null;
  members: { id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Reports to"
      className="h-8 rounded-[9px] border border-border bg-surface px-2 text-meta text-text-1 outline-none focus-visible:border-brand"
      value={reportsTo ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await updateReportsTo(ws, profileId, e.target.value || null);
          if (res.error) toast.error(res.error);
          else toast.success(res.success ?? "Saved.");
        })
      }
    >
      <option value="">Nobody</option>
      {members
        .filter((m) => m.id !== profileId)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
    </select>
  );
}

export function OffboardButton({
  ws,
  profileId,
  name,
}: {
  ws: string;
  profileId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Offboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Offboard {name}?</DialogTitle>
        </DialogHeader>
        <p className="text-body text-text-2">
          Their membership is deactivated and they lose access on their next
          request. Their work history stays.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep active
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await offboardPerson(ws, profileId);
                if (res.error) toast.error(res.error);
                else {
                  toast.success(res.success ?? "Done.");
                  setOpen(false);
                }
              })
            }
          >
            {pending ? "Offboarding" : "Offboard"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
