"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import {
  createClientRecord,
  type ClientFormState,
} from "@/lib/actions/clients";
import type { OwnerOption } from "./queries";

const initialState: ClientFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

const ORIGIN_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "ghl_video", label: "GHL Video" },
  { value: "ghl_animation", label: "GHL Animation" },
];

export interface KickoffTemplateOption {
  id: string;
  name: string;
  phases: number;
  tasks: number;
  deliverables: number;
  is_default: boolean;
}

interface PlanRow {
  label: string;
  amount: string;
  due_date: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="group-label border-b border-border pb-1.5">{children}</div>;
}

// New client intake. Three sections ending in a live handoff preview, so
// the automation is visible before it runs.
export function NewClientForm({
  ws,
  owners,
  templates,
  ownerName,
}: {
  ws: string;
  owners: OwnerOption[];
  templates: KickoffTemplateOption[];
  ownerName: string;
}) {
  const [state, formAction, pending] = useActionState(
    createClientRecord,
    initialState
  );
  const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0];
  const [templateId, setTemplateId] = useState(defaultTemplate?.id ?? "");
  const [timing, setTiming] = useState("immediate");
  const [plan, setPlan] = useState<PlanRow[]>([
    { label: "Full payment", amount: "", due_date: "" },
  ]);

  const template = templates.find((t) => t.id === templateId);
  const planTotal = useMemo(
    () => plan.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [plan]
  );

  const setRow = (i: number, patch: Partial<PlanRow>) =>
    setPlan((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const splitPlan = () =>
    setPlan([
      { label: "Deposit 50%", amount: "", due_date: "" },
      { label: "Balance 50%", amount: "", due_date: "" },
    ]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="payment_plan" value={JSON.stringify(plan)} />

      <SectionLabel>Who they are</SectionLabel>
      <Field label="Commercial name" htmlFor="commercial_name">
        <input id="commercial_name" name="commercial_name" required placeholder="Acme Fitness" className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website" htmlFor="website">
          <input id="website" name="website" placeholder="acme.com" className={inputClass} />
        </Field>
        <Field
          label="Origin"
          htmlFor="origin"
          hint="Origin is above-wall data. Below the wall it does not exist."
        >
          <select id="origin" name="origin" className={inputClass} defaultValue="direct">
            {ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contact name" htmlFor="contact_name">
          <input id="contact_name" name="contact_name" placeholder="Jamie Rivera" className={inputClass} />
        </Field>
        <Field label="Contact email" htmlFor="contact_email">
          <input id="contact_email" name="contact_email" type="email" placeholder="jamie@acme.com" className={inputClass} />
        </Field>
        <Field label="Contact phone" htmlFor="contact_phone">
          <input id="contact_phone" name="contact_phone" placeholder="+1 555 0100" className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="HighLevel record" htmlFor="highlevel_url" hint="Sales history stays in HighLevel.">
          <input id="highlevel_url" name="highlevel_url" placeholder="app.gohighlevel.com/..." className={inputClass} />
        </Field>
        <Field label="Owner" htmlFor="owner_id">
          <select id="owner_id" name="owner_id" className={inputClass} defaultValue="none">
            <option value="none">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionLabel>The deal</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total value" htmlFor="contract_value">
          <input
            id="contract_value"
            name="contract_value"
            type="number"
            min="0"
            step="100"
            placeholder="9500"
            className={`${inputClass} font-mono tabular`}
          />
        </Field>
        <div className="flex items-end pb-0.5">
          <Button type="button" variant="outline" size="sm" onClick={splitPlan}>
            Split 50/50
          </Button>
        </div>
      </div>
      <Field
        label="Payment plan"
        hint={
          planTotal > 0
            ? `Scheduled: ${fmtMoney(planTotal)}. Paid rows get checked off on the client page.`
            : "Track what was invoiced and what is still due."
        }
      >
        <div className="flex flex-col gap-2">
          {plan.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`Payment ${i + 1} label`}
                value={row.label}
                onChange={(e) => setRow(i, { label: e.target.value })}
                placeholder="Deposit 50%"
                className={inputClass}
              />
              <input
                aria-label={`Payment ${i + 1} amount`}
                value={row.amount}
                onChange={(e) => setRow(i, { amount: e.target.value })}
                type="number"
                min="0"
                step="50"
                placeholder="4750"
                className={`${inputClass} max-w-[120px] font-mono tabular`}
              />
              <input
                aria-label={`Payment ${i + 1} due date`}
                value={row.due_date}
                onChange={(e) => setRow(i, { due_date: e.target.value })}
                type="date"
                className={`${inputClass} max-w-[150px]`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove payment"
                onClick={() => setPlan((rows) => rows.filter((_, idx) => idx !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setPlan((rows) => [...rows, { label: "", amount: "", due_date: "" }])}
          >
            <Plus />
            Add payment
          </Button>
        </div>
      </Field>

      <SectionLabel>What we sold</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kickoff template" htmlFor="kickoff_template_id">
          <select
            id="kickoff_template_id"
            name="kickoff_template_id"
            className={inputClass}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Create the kickoff project" htmlFor="kickoff_timing">
          <select
            id="kickoff_timing"
            name="kickoff_timing"
            className={inputClass}
            value={timing}
            onChange={(e) => setTiming(e.target.value)}
          >
            <option value="immediate">Right away</option>
            <option value="manual">Manually, later</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Project price"
          htmlFor="kickoff_price"
          hint="Visible to executives and the assigned manager only."
        >
          <input
            id="kickoff_price"
            name="kickoff_price"
            type="number"
            min="0"
            step="50"
            placeholder="9500"
            className={`${inputClass} font-mono tabular`}
          />
        </Field>
        <Field label="Invoice terms" htmlFor="invoice_terms">
          <input
            id="invoice_terms"
            name="invoice_terms"
            placeholder="50% upfront, 50% on delivery"
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Intake form link"
        htmlFor="intake_form_url"
        hint="Attached to the kickoff project. The team marks it sent and received there."
      >
        <input id="intake_form_url" name="intake_form_url" placeholder="forms.gle/..." className={inputClass} />
      </Field>

      <div className="rounded-[10px] bg-brand-soft/60 px-4 py-3 text-[12.5px] leading-relaxed text-text-1">
        <span className="font-semibold">What happens on create:</span>{" "}
        the client lands in Onboard
        {template
          ? `, and ${
              timing === "immediate"
                ? "a kickoff project is scaffolded right away with its own intake tracker"
                : "the kickoff project waits for you to start it"
            } from ${template.name}: ${template.phases} phases, ${template.tasks} tasks, ${template.deliverables} deliverables, owned by ${ownerName}`
          : ""}
        . The team is notified with codes only.
      </div>

      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
