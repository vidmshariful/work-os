"use client";

import { useActionState, useRef, useState } from "react";
import { createProject, type ProjectFormState } from "@/lib/actions/projects";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import type { MemberOption } from "./types";

export interface TemplateOption {
  id: string;
  name: string;
  project_type: string | null;
}

export interface ClientOption {
  id: string;
  label: string;
}

const initialState: ProjectFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// New project form. Choosing a template prefills the title and type as long
// as the user has not typed their own values yet.
export function NewProjectForm({
  ws,
  templates,
  clients,
  members,
  defaultOwnerId,
}: {
  ws: string;
  templates: TemplateOption[];
  clients: ClientOption[];
  members: MemberOption[];
  defaultOwnerId: string;
}) {
  const [state, formAction, pending] = useActionState(
    createProject,
    initialState
  );
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  // The last values a template prefilled, so a manual edit is never
  // overwritten by switching templates.
  const prefills = useRef({ title: "", type: "" });

  const onTemplateChange = (templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    if (title === "" || title === prefills.current.title) {
      setTitle(t.name);
      prefills.current.title = t.name;
    }
    if (t.project_type && (type === "" || type === prefills.current.type)) {
      setType(t.project_type);
      prefills.current.type = t.project_type;
    }
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />

      <Field
        label="Template"
        htmlFor="template_id"
        hint="Scaffolds phases, tasks, and deliverables."
      >
        <select
          id="template_id"
          name="template_id"
          className={inputClass}
          defaultValue=""
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Title"
        htmlFor="title"
        hint="Use a spec title, never a client name"
      >
        <input
          id="title"
          name="title"
          required
          placeholder="Explainer video, 90s"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="client_id">
          <select
            id="client_id"
            name="client_id"
            className={inputClass}
            defaultValue=""
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type" htmlFor="type">
          <input
            id="type"
            name="type"
            placeholder="Animation"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Owner" htmlFor="owner_id">
        <select
          id="owner_id"
          name="owner_id"
          className={inputClass}
          defaultValue={defaultOwnerId}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="start_date">
          <input
            id="start_date"
            name="start_date"
            type="date"
            className={inputClass}
          />
        </Field>
        <Field label="Due date" htmlFor="due_date">
          <input
            id="due_date"
            name="due_date"
            type="date"
            className={inputClass}
          />
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
