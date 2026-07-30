"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import { setProjectBrief, updateProject } from "@/lib/actions/projects";
import type { MemberOption, ProjectWithOwner } from "./types";
import type { DeptOption } from "./new-project-form";

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// The project brief: an autosaving textarea for managers and the owner, a
// read-only paragraph for everyone else. Saves when focus leaves the field.
export function ProjectBrief({
  ws,
  projectId,
  brief,
  canEdit,
}: {
  ws: string;
  projectId: string;
  brief: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(brief ?? "");
  const saved = useRef(brief ?? "");
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-1">
        {brief}
      </p>
    );
  }

  const save = () => {
    if (value === saved.current) return;
    const next = value;
    saved.current = next;
    startTransition(async () => {
      const res = await setProjectBrief(ws, projectId, next);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <textarea
      value={value}
      aria-label="Project brief"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      rows={3}
      disabled={pending}
      placeholder="Add a short brief. What is this project, for whom, and what does done look like? Saves when you click away."
      className={`${inputClass} min-h-[76px] resize-y py-2 leading-relaxed`}
    />
  );
}

// Edit the project header: title, type, dates, owner. Managers and the owner.
export function EditProjectDialog({
  ws,
  project,
  members,
  departments,
}: {
  ws: string;
  project: ProjectWithOwner;
  members: MemberOption[];
  departments: DeptOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(project.title);
  const [type, setType] = useState(project.type ?? "");
  const [start, setStart] = useState(project.start_date ?? "");
  const [due, setDue] = useState(project.due_date ?? "");
  const [owner, setOwner] = useState(project.owner_id ?? "");
  const [dept, setDept] = useState(project.department_id ?? "");
  const [list, setList] = useState(project.list_id ?? "");
  const lists = departments.find((d) => d.id === dept)?.lists ?? [];

  const onSave = () =>
    startTransition(async () => {
      const res = await updateProject(ws, project.id, {
        title,
        type,
        start_date: start,
        due_date: due,
        owner_id: owner || null,
        department_id: dept || null,
        list_id: list || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Project saved.");
      setOpen(false);
    });

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
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="ep_title">
            <input
              id="ep_title"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Type" htmlFor="ep_type" hint="Brand-blind, for example production or explainer.">
            <input
              id="ep_type"
              className={inputClass}
              value={type}
              placeholder="Production"
              onChange={(e) => setType(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="ep_start">
              <input
                id="ep_start"
                type="date"
                className={inputClass}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Due date" htmlFor="ep_due">
              <input
                id="ep_due"
                type="date"
                className={inputClass}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Owner" htmlFor="ep_owner">
            <select
              id="ep_owner"
              className={inputClass}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </Field>
          {departments.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Space" htmlFor="ep_dept">
                <select
                  id="ep_dept"
                  className={inputClass}
                  value={dept}
                  onChange={(e) => {
                    setDept(e.target.value);
                    setList("");
                  }}
                >
                  <option value="">Unfiled</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="List" htmlFor="ep_list">
                <select
                  id="ep_list"
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
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={pending || !title.trim()}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
