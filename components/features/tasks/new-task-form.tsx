"use client";

import { useActionState, useEffect, useState } from "react";
import { createTask, getPhasesForProject, type TaskActionState } from "@/lib/actions/tasks";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABELS } from "./task-bits";

export interface ProjectOption {
  id: string;
  code: string;
  title: string;
}

export interface MemberOption {
  id: string;
  full_name: string;
}

const initialState: TaskActionState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function NewTaskForm({
  ws,
  projects,
  members,
  defaultProjectId,
}: {
  ws: string;
  projects: ProjectOption[];
  members: MemberOption[];
  defaultProjectId: string;
}) {
  const [state, formAction, pending] = useActionState(createTask, initialState);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setPhases([]);
      return;
    }
    getPhasesForProject(ws, projectId).then((rows) => {
      if (!cancelled) setPhases(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [ws, projectId]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ws" value={ws} />

      <Field label="Project" htmlFor="project_id">
        <select
          id="project_id"
          name="project_id"
          required
          className={inputClass}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Pick a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}: {p.title}
            </option>
          ))}
        </select>
      </Field>

      {phases.length > 0 ? (
        <Field label="Phase" htmlFor="phase_id">
          <select id="phase_id" name="phase_id" className={inputClass} defaultValue="">
            <option value="">No phase</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          placeholder="Animate the intro sequence"
          className={inputClass}
        />
      </Field>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Scope, references, and anything the assignee needs."
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Assignee" htmlFor="assignee_id">
          <select id="assignee_id" name="assignee_id" className={inputClass} defaultValue="">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <select id="priority" name="priority" className={inputClass} defaultValue="0">
            {PRIORITY_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date" htmlFor="due_date">
          <input id="due_date" name="due_date" type="date" className={inputClass} />
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
