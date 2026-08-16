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

export interface DeptOption {
  id: string;
  name: string;
  lists: { id: string; name: string }[];
}

const initialState: ProjectFormState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// New project form. Choosing a template prefills the title and type as long
// as the user has not typed their own values yet.
export function NewProjectForm({
  ws,
  templates,
  clients,
  members,
  departments,
  defaultOwnerId,
  defaultDepartmentId,
  defaultListId,
}: {
  ws: string;
  templates: TemplateOption[];
  clients: ClientOption[];
  members: MemberOption[];
  departments: DeptOption[];
  defaultOwnerId: string;
  defaultDepartmentId?: string;
  defaultListId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createProject,
    initialState
  );
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [dept, setDept] = useState(
    defaultDepartmentId ?? departments[0]?.id ?? ""
  );
  const [list, setList] = useState(defaultListId ?? "");
  const lists = departments.find((d) => d.id === dept)?.lists ?? [];
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
        <Field label="Department" htmlFor="department_id" hint="Which space this work lives in.">
          <select
            id="department_id"
            name="department_id"
            className={inputClass}
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setList("");
            }}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="List" htmlFor="list_id" hint="Optional bucket inside the space.">
          <select
            id="list_id"
            name="list_id"
            className={inputClass}
            value={list}
            onChange={(e) => setList(e.target.value)}
            disabled={lists.length === 0}
          >
            <option value="">No list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

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
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
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
