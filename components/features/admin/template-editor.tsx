"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/primitives/field";
import { Tag } from "@/components/primitives/tag";
import {
  deleteTemplate,
  saveTemplate,
  type TemplateDraft,
} from "@/lib/actions/admin";
import type { ProjectTemplate } from "@/lib/types";
import type { TemplateStructureDraft } from "./shared";

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";
const smallInputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand";

interface PhaseDraft {
  name: string;
  tasks: { title: string; description?: string }[];
}

function emptyDraft(): TemplateDraft {
  return {
    name: "",
    description: "",
    project_type: "",
    is_default: false,
    structure: { phases: [], deliverables: [] },
  };
}

function toDraft(t: ProjectTemplate): TemplateDraft {
  const structure = t.structure as TemplateStructureDraft;
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    project_type: t.project_type ?? "",
    is_default: t.is_default,
    structure: {
      default_title: structure.default_title ?? "",
      phases: (structure.phases ?? []).map((p) => ({
        name: p.name,
        tasks: (p.tasks ?? []).map((task) => ({ ...task })),
      })),
      deliverables: [...(structure.deliverables ?? [])],
    },
  };
}

export function TemplateManager({
  ws,
  templates,
}: {
  ws: string;
  templates: ProjectTemplate[];
}) {
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Delete the template "${name}"? Projects built from it keep their structure.`)) return;
    startTransition(async () => {
      const res = await deleteTemplate(ws, id);
      if (!res.ok) toast.error(res.error ?? "Could not delete.");
      else toast.success("Template deleted.");
    });
  };

  if (editing) {
    return (
      <TemplateEditor
        ws={ws}
        draft={editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing(emptyDraft())}>
          <Plus />
          New template
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((t) => {
          const phases = (t.structure?.phases ?? []).length;
          const tasks = (t.structure?.phases ?? []).reduce(
            (acc, p) => acc + (p.tasks?.length ?? 0),
            0
          );
          return (
            <div
              key={t.id}
              className="rounded-[14px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-text-1">{t.name}</span>
                    {t.is_default ? <Tag tone="blue">Default</Tag> : null}
                  </div>
                  {t.description ? (
                    <p className="mt-1 text-[12.5px] text-text-2">{t.description}</p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 font-mono text-[12px] text-text-3 tabular">
                {phases} phases · {tasks} tasks · {(t.structure?.deliverables ?? []).length} deliverables
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(toDraft(t))}>
                  <Pencil />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => remove(t.id, t.name)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateEditor({
  ws,
  draft: initial,
  onClose,
}: {
  ws: string;
  draft: TemplateDraft;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [pending, startTransition] = useTransition();
  const phases = (draft.structure.phases ?? []) as PhaseDraft[];
  const deliverables = draft.structure.deliverables ?? [];

  const setStructure = (patch: Partial<TemplateStructureDraft>) =>
    setDraft((d) => ({ ...d, structure: { ...d.structure, ...patch } }));

  const setPhase = (i: number, patch: Partial<PhaseDraft>) => {
    const next = phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    setStructure({ phases: next });
  };

  const movePhase = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases];
    [next[i], next[j]] = [next[j], next[i]];
    setStructure({ phases: next });
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveTemplate(ws, draft);
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else {
        toast.success("Template saved.");
        onClose();
      }
    });

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-text-1">
          {draft.id ? "Edit template" : "New template"}
        </h3>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="tpl_name">
          <input
            id="tpl_name"
            className={inputClass}
            value={draft.name}
            placeholder="Explainer video pipeline"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Project type" htmlFor="tpl_type">
          <input
            id="tpl_type"
            className={inputClass}
            value={draft.project_type}
            placeholder="explainer_video"
            onChange={(e) => setDraft({ ...draft, project_type: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Description" htmlFor="tpl_desc">
          <input
            id="tpl_desc"
            className={inputClass}
            value={draft.description}
            placeholder="What this template is for"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <Field
          label="Default project title"
          htmlFor="tpl_title"
          hint="Used by the handoff. Brand-blind, never a client name."
        >
          <input
            id="tpl_title"
            className={inputClass}
            value={draft.structure.default_title ?? ""}
            placeholder="Explainer video production"
            onChange={(e) => setStructure({ default_title: e.target.value })}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm text-text-1">
        <Switch
          checked={draft.is_default}
          onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
        />
        Default template. The handoff scaffolds new clients from this one.
      </label>

      <div className="flex flex-col gap-3">
        <span className="group-label">Phases</span>
        {phases.map((phase, i) => (
          <div key={i} className="rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label={`Phase ${i + 1} name`}
                className={smallInputClass}
                value={phase.name}
                placeholder="Phase name"
                onChange={(e) => setPhase(i, { name: e.target.value })}
              />
              <Button variant="ghost" size="icon-xs" aria-label="Move up" onClick={() => movePhase(i, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move down" onClick={() => movePhase(i, 1)}>
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove phase"
                onClick={() => setStructure({ phases: phases.filter((_, idx) => idx !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 pl-1">
              {phase.tasks.map((task, ti) => (
                <div key={ti} className="flex items-center gap-2">
                  <input
                    aria-label={`Task ${ti + 1} in phase ${i + 1}`}
                    className={smallInputClass}
                    value={task.title}
                    placeholder="Task title"
                    onChange={(e) =>
                      setPhase(i, {
                        tasks: phase.tasks.map((t, idx) =>
                          idx === ti ? { ...t, title: e.target.value } : t
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove task"
                    onClick={() =>
                      setPhase(i, { tasks: phase.tasks.filter((_, idx) => idx !== ti) })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setPhase(i, { tasks: [...phase.tasks, { title: "" }] })}
              >
                <Plus />
                Add task
              </Button>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setStructure({ phases: [...phases, { name: "", tasks: [] }] })}
        >
          <Plus />
          Add phase
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="group-label">Deliverables</span>
        {deliverables.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Deliverable ${i + 1}`}
              className={smallInputClass}
              value={d}
              placeholder="60 second master video"
              onChange={(e) =>
                setStructure({
                  deliverables: deliverables.map((x, idx) => (idx === i ? e.target.value : x)),
                })
              }
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove deliverable"
              onClick={() =>
                setStructure({ deliverables: deliverables.filter((_, idx) => idx !== i) })
              }
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setStructure({ deliverables: [...deliverables, ""] })}
        >
          <Plus />
          Add deliverable
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={pending} onClick={save}>
          {pending ? "Saving" : "Save template"}
        </Button>
      </div>
    </div>
  );
}
