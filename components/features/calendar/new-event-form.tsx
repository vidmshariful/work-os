"use client";

import { useActionState } from "react";
import { createEvent, type EventFormState } from "@/lib/actions/events";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";

const initialState: EventFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function NewEventForm({ ws }: { ws: string }) {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />
      <Field label="Title" htmlFor="ev_title">
        <input
          id="ev_title"
          name="title"
          required
          placeholder="Studio shoot day"
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="ev_type">
          <select id="ev_type" name="type" className={inputClass} defaultValue="meeting">
            <option value="shoot">Shoot</option>
            <option value="meeting">Meeting</option>
            <option value="holiday">Holiday</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="First day" htmlFor="ev_start">
          <input id="ev_start" name="start_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Last day" htmlFor="ev_end" hint="Leave empty for one day.">
          <input id="ev_end" name="end_date" type="date" className={inputClass} />
        </Field>
      </div>
      <Field label="Description" htmlFor="ev_desc">
        <textarea
          id="ev_desc"
          name="description"
          rows={3}
          placeholder="Optional"
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
      </Field>
      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
