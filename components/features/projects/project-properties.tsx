"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProjectStatusChip, ConfidentialChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { DueDate } from "@/components/features/projects/due-date";
import {
  EmptyValue,
  PropertyRow,
  propertyInputClass,
  propertyTriggerClass,
} from "@/components/features/projects/property-row";
import { PROJECT_STATUS_OPTIONS } from "@/components/features/projects/types";
import type { MemberOption } from "@/components/features/projects/types";
import {
  setProjectDueDate,
  setProjectOwner,
  updateProject,
  updateProjectStatus,
} from "@/lib/actions/projects";
import { fmtDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

export interface PropertyProject {
  id: string;
  status: ProjectStatus;
  type: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  owner: { id: string; full_name: string; avatar_url: string | null } | null;
}

// What the client cell shows, decided on the server so lib/wall.ts never
// reaches the browser. Below the wall this is a code and nothing else, and
// it must look like the normal state of the world rather than a redaction.
export interface ClientCell {
  href: string | null;
  label: string | null;
  code: string | null;
  confidential: boolean;
}

// The block that is always open, directly under the title. Everything a
// person asks about a project at a glance, in one place, in the order the
// tool they came from puts it.
//
// It is a deliberate sibling of the Fields block below it: same row shell,
// same Empty convention, same inline editing. The Fields block keeps its
// chevron and its counter, which is what tells the two apart.
export function ProjectProperties({
  ws,
  project,
  client,
  members,
  assignees,
  canEdit,
}: {
  ws: string;
  project: PropertyProject;
  client: ClientCell;
  members: MemberOption[];
  // Everyone assigned to a task on this project. Read only here: the label
  // says where they come from, so nobody expects to assign from this cell.
  assignees: { id: string; full_name: string; avatar_url: string | null }[];
  // projects_update is manager-or-owner, so this is per project.
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else router.refresh();
    });

  return (
    <Card>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
        {/* Status */}
        <PropertyRow label="Status" size="half" pending={pending}>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change status"
                  className={propertyTriggerClass}
                >
                  <ProjectStatusChip status={project.status} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {PROJECT_STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onSelect={() => run(() => updateProjectStatus(ws, project.id, s.value))}
                  >
                    <Check
                      strokeWidth={2}
                      className={cn(project.status !== s.value && "opacity-0")}
                    />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="px-1">
              <ProjectStatusChip status={project.status} />
            </span>
          )}
        </PropertyRow>

        {/* Owner */}
        <PropertyRow label="Owner" size="half" pending={pending}>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change owner"
                  className={cn(propertyTriggerClass, "flex items-center gap-1.5 text-[13px] text-text-1")}
                >
                  {project.owner ? (
                    <>
                      <PersonAvatar
                        name={project.owner.full_name}
                        src={project.owner.avatar_url}
                        size={20}
                      />
                      {project.owner.full_name}
                    </>
                  ) : (
                    <EmptyValue label="Unassigned" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
                {members.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => run(() => setProjectOwner(ws, project.id, m.id))}
                  >
                    <Check
                      strokeWidth={2}
                      className={cn(project.owner?.id !== m.id && "opacity-0")}
                    />
                    {m.full_name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => run(() => setProjectOwner(ws, project.id, null))}>
                  Unassigned
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : project.owner ? (
            <span className="flex items-center gap-1.5 px-2 text-[13px] text-text-1">
              <PersonAvatar
                name={project.owner.full_name}
                src={project.owner.avatar_url}
                size={20}
              />
              {project.owner.full_name}
            </span>
          ) : (
            <EmptyValue label="Unassigned" />
          )}
        </PropertyRow>

        {/* Dates. The due tone comes from dueState through DueDate, never
            re-derived, so this cannot drift from every row and board card. */}
        <PropertyRow label="Dates" size="half" pending={pending}>
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit ? (
              <>
                <input
                  type="date"
                  defaultValue={project.start_date ?? ""}
                  aria-label="Start date"
                  onChange={(e) =>
                    run(() => updateProject(ws, project.id, { start_date: e.target.value || null }))
                  }
                  className={cn(propertyInputClass, "w-[132px] font-mono tabular")}
                />
                <span className="text-text-3">to</span>
                <input
                  type="date"
                  defaultValue={project.due_date ?? ""}
                  aria-label="Due date"
                  onChange={(e) =>
                    run(() => setProjectDueDate(ws, project.id, e.target.value || null))
                  }
                  className={cn(propertyInputClass, "w-[132px] font-mono tabular")}
                />
              </>
            ) : project.start_date || project.due_date ? (
              <span className="px-2 font-mono text-[13px] text-text-1 tabular">
                {project.start_date ? fmtDateFull(project.start_date) : "Any time"} to{" "}
                {project.due_date ? fmtDateFull(project.due_date) : "no end"}
              </span>
            ) : (
              <EmptyValue />
            )}
            <DueDate due={project.due_date} status={project.status} />
          </div>
        </PropertyRow>

        {/* People on tasks. Names are spelled out, not just stacked: an
            avatar stack caps at four and a "+5" chip names nobody. */}
        <PropertyRow label="People on tasks" size="half">
          {assignees.length === 0 ? (
            <EmptyValue label="Nobody assigned yet" />
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-0.5">
              {assignees.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 text-[12.5px] text-text-1"
                >
                  <PersonAvatar name={a.full_name} src={a.avatar_url} size={20} />
                  {a.full_name}
                </span>
              ))}
            </span>
          )}
        </PropertyRow>

        {/* Client. Read only: nothing here changes it, and below the wall it
            is a code with no hint that anything is hidden. */}
        <PropertyRow label="Client" size="half">
          {client.href && client.label ? (
            <span className="flex flex-wrap items-center gap-2 px-2">
              <Link href={client.href} className="text-[13px] text-brand hover:underline">
                {client.label}
              </Link>
              {client.confidential ? <ConfidentialChip /> : null}
            </span>
          ) : client.code ? (
            <span className="px-2">
              <CodeLabel code={client.code} />
            </span>
          ) : (
            <EmptyValue label="Internal" />
          )}
        </PropertyRow>

        {/* Type */}
        <PropertyRow label="Type" size="half" pending={pending}>
          {canEdit ? (
            <TypeCell
              value={project.type}
              onSave={(v) => run(() => updateProject(ws, project.id, { type: v }))}
            />
          ) : project.type ? (
            <span className="px-2 text-[13px] text-text-1">{project.type}</span>
          ) : (
            <EmptyValue />
          )}
        </PropertyRow>
      </div>

      <div className="border-t border-border px-5 py-2 text-[11.5px] text-text-3">
        Created {fmtDateFull(project.created_at)}
      </div>
    </Card>
  );
}

function TypeCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <input
      value={draft}
      placeholder="Empty"
      aria-label="Type"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== (value ?? "") && onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(value ?? "");
          e.currentTarget.blur();
        }
      }}
      className={propertyInputClass}
    />
  );
}
