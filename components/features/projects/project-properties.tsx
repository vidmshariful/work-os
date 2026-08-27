"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { ProjectPeople, type PersonRef } from "@/components/features/projects/project-people";
import { ProjectStatusChip, ConfidentialChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { DueDate } from "@/components/features/projects/due-date";
import {
  EmptyValue,
  PropertyRow,
  propertyInputClass,
  propertyTriggerClass,
  sameValue,
  type Edit,
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
  assigned,
  onTasks,
  canEdit,
}: {
  ws: string;
  project: PropertyProject;
  client: ClientCell;
  members: MemberOption[];
  // Two different facts. assigned is the deliberate list and is editable
  // here; onTasks is derived from the tasks and is shown beside it, because
  // the place to change that is the task.
  assigned: PersonRef[];
  onTasks: PersonRef[];
  // projects_update is manager-or-owner, so this is per project.
  canEdit: boolean;
}) {
  // Same deal as the Fields block below: the picked value is drawn from the
  // click and the round trip happens behind it. Before this, a status change
  // waited for the action to re-render the page and then for a second render
  // from router.refresh(), about four seconds for a write that takes ninety
  // milliseconds. The action already revalidates this path, so the refresh
  // was a duplicate of work the response was carrying anyway.
  //
  // Keyed by property name rather than by field id, and each one settles as
  // soon as the server's copy says the same thing.
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const seqRef = useRef<Record<string, number>>({});

  // edits is a dependency too: a write that settles on the value the server
  // already held changes none of the five below, and without it the override
  // would sit there for good, deaf to anything anyone else changed later.
  useEffect(() => {
    const server: Record<string, unknown> = {
      status: project.status,
      owner: project.owner?.id ?? null,
      start_date: project.start_date,
      due_date: project.due_date,
      type: project.type,
    };
    setEdits((prev) => {
      let changed = false;
      const next: Record<string, Edit> = {};
      for (const [key, edit] of Object.entries(prev)) {
        if (!edit.pending && sameValue(server[key], edit.value)) {
          changed = true;
          continue;
        }
        next[key] = edit;
      }
      // Returning prev unchanged is what stops this from looping.
      return changed ? next : prev;
    });
  }, [
    project.status,
    project.owner?.id,
    project.start_date,
    project.due_date,
    project.type,
    edits,
  ]);

  const run = useCallback(
    (key: string, next: unknown, label: string, fn: () => Promise<{ error: string | null }>) => {
      const seq = (seqRef.current[key] ?? 0) + 1;
      seqRef.current[key] = seq;
      setEdits((prev) => ({ ...prev, [key]: { value: next, seq, pending: true } }));

      const revert = () =>
        setEdits((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });

      void (async () => {
        let res;
        try {
          res = await fn();
        } catch {
          // A server action rejects rather than returns when the request does
          // not complete: offline, a 500, a session that lapsed into a
          // redirect, or a deploy that moved the action. Without this the
          // value would stay on screen as though it saved, and stay pending,
          // so nothing would ever correct it.
          if (seqRef.current[key] !== seq) return;
          toast.error(`${label} could not be saved. Check your connection and try again.`);
          revert();
          return;
        }
        if (seqRef.current[key] !== seq) return;
        if (res.error) {
          toast.error(`${label}: ${res.error}`);
          revert();
          return;
        }
        setEdits((prev) => ({ ...prev, [key]: { value: next, seq, pending: false } }));
      })();
    },
    []
  );

  const shown = <T,>(key: string, fallback: T): T =>
    (edits[key] ? (edits[key].value as T) : fallback);
  const busy = (key: string) => Boolean(edits[key]?.pending);

  const status = shown("status", project.status);
  const ownerId = shown<string | null>("owner", project.owner?.id ?? null);
  // The picker only carries names, so an owner shown before the server has
  // confirmed wears initials for a beat and then gains their photo. Better
  // than the name not moving at all.
  const picked = members.find((m) => m.id === ownerId);
  const owner =
    ownerId === (project.owner?.id ?? null)
      ? project.owner
      : picked
        ? { id: picked.id, full_name: picked.full_name, avatar_url: null }
        : null;
  const startDate = shown<string | null>("start_date", project.start_date);
  const dueDate = shown<string | null>("due_date", project.due_date);
  const type = shown<string | null>("type", project.type);

  return (
    <Card>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
        {/* Status */}
        <PropertyRow label="Status" size="half" pending={busy("status")}>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change status"
                  className={propertyTriggerClass}
                >
                  <ProjectStatusChip status={status} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {PROJECT_STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onSelect={() =>
                      run("status", s.value, "Status", () =>
                        updateProjectStatus(ws, project.id, s.value)
                      )
                    }
                  >
                    <Check strokeWidth={2} className={cn(status !== s.value && "opacity-0")} />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="px-1">
              <ProjectStatusChip status={status} />
            </span>
          )}
        </PropertyRow>

        {/* Owner */}
        <PropertyRow label="Owner" size="half" pending={busy("owner")}>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change owner"
                  className={cn(propertyTriggerClass, "flex items-center gap-1.5 text-body text-text-1")}
                >
                  {owner ? (
                    <>
                      <PersonAvatar
                        name={owner.full_name}
                        src={owner.avatar_url}
                        size={20}
                      />
                      {owner.full_name}
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
                    onSelect={() =>
                      run("owner", m.id, "Owner", () => setProjectOwner(ws, project.id, m.id))
                    }
                  >
                    <Check strokeWidth={2} className={cn(ownerId !== m.id && "opacity-0")} />
                    {m.full_name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    run("owner", null, "Owner", () => setProjectOwner(ws, project.id, null))
                  }
                >
                  Unassigned
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : owner ? (
            <span className="flex items-center gap-1.5 px-2 text-body text-text-1">
              <PersonAvatar name={owner.full_name} src={owner.avatar_url} size={20} />
              {owner.full_name}
            </span>
          ) : (
            <EmptyValue label="Unassigned" />
          )}
        </PropertyRow>

        {/* Dates. The due tone comes from dueState through DueDate, never
            re-derived, so this cannot drift from every row and board card. */}
        <PropertyRow
          label="Dates"
          size="half"
          pending={busy("start_date") || busy("due_date")}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit ? (
              <>
                <input
                  type="date"
                  value={startDate ?? ""}
                  aria-label="Start date"
                  onChange={(e) =>
                    run("start_date", e.target.value || null, "Start date", () =>
                      updateProject(ws, project.id, { start_date: e.target.value || null })
                    )
                  }
                  className={cn(propertyInputClass, "w-[132px] font-mono tabular")}
                />
                <span className="text-meta text-text-3">to</span>
                <input
                  type="date"
                  value={dueDate ?? ""}
                  aria-label="Due date"
                  onChange={(e) =>
                    run("due_date", e.target.value || null, "Due date", () =>
                      setProjectDueDate(ws, project.id, e.target.value || null)
                    )
                  }
                  className={cn(propertyInputClass, "w-[132px] font-mono tabular")}
                />
              </>
            ) : startDate || dueDate ? (
              <span className="px-2 font-mono text-body text-text-1 tabular">
                {startDate ? fmtDateFull(startDate) : "Any time"} to{" "}
                {dueDate ? fmtDateFull(dueDate) : "no end"}
              </span>
            ) : (
              <EmptyValue />
            )}
            <DueDate due={dueDate} status={status} />
          </div>
        </PropertyRow>

        {/* Who is on this project. The deliberate list can be edited here;
            people who merely hold a task are shown beside it and are changed
            by changing the task. */}
        <PropertyRow label="People" size="half">
          <ProjectPeople
            ws={ws}
            projectId={project.id}
            assigned={assigned}
            onTasks={onTasks}
            members={members}
            canEdit={canEdit}
          />
        </PropertyRow>

        {/* Client. Read only: nothing here changes it, and below the wall it
            is a code with no hint that anything is hidden. */}
        <PropertyRow label="Client" size="half">
          {client.href && client.label ? (
            <span className="flex flex-wrap items-center gap-2 px-2">
              <Link href={client.href} className="text-body text-brand hover:underline">
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
        <PropertyRow label="Type" size="half" pending={busy("type")}>
          {canEdit ? (
            <TypeCell
              value={type}
              // Settled on the trimmed value, which is what updateProject
              // stores, so the override matches when the server answers.
              onSave={(v) =>
                run("type", v.trim() || null, "Type", () =>
                  updateProject(ws, project.id, { type: v })
                )
              }
            />
          ) : type ? (
            <span className="px-2 text-body text-text-1">{type}</span>
          ) : (
            <EmptyValue />
          )}
        </PropertyRow>
      </div>

      <div className="border-t border-border px-5 py-2 text-label text-text-3">
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
