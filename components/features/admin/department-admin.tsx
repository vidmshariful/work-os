"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Button } from "@/components/ui/button";
import { DeleteSpaceCard } from "@/components/features/departments/space-settings";
import {
  addDepartmentMember,
  createDepartment,
  removeDepartmentMember,
  renameDepartment,
  setDefaultDepartment,
} from "@/lib/actions/departments";

export interface DeptAdminMember {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface DeptAdminRow {
  id: string;
  name: string;
  slug: string;
  accent_color: string;
  is_default: boolean;
  members: DeptAdminMember[];
  // Quoted back in the delete confirmation, so it says what will actually
  // happen rather than a general warning.
  projectCount: number;
  listCount: number;
}

const ACCENTS = ["#3B6FF6", "#7C5CFC", "#16A34A", "#E5486D", "#12A8A0", "#8A94A3"];

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

function CreateDepartment({ ws }: { ws: string }) {
  const [name, setName] = useState("");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [pending, start] = useTransition();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const res = await createDepartment(ws, n, accent);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      toast.success("Space created.");
    });
  };

  return (
    <Card className="p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New space name"
          className={`${inputClass} max-w-xs`}
        />
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => setAccent(c)}
              className="flex size-6 items-center justify-center rounded-full"
              style={{ backgroundColor: `${c}2A` }}
            >
              <span className="size-3.5 rounded-full" style={{ backgroundColor: c }}>
                {accent === c ? (
                  <Check className="size-3.5 text-white" strokeWidth={3} />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          <Plus />
          Add space
        </Button>
      </form>
    </Card>
  );
}

function DepartmentCard({
  ws,
  dept,
  allMembers,
}: {
  ws: string;
  dept: DeptAdminRow;
  allMembers: DeptAdminMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(dept.name);
  const [pending, start] = useTransition();

  const memberIds = new Set(dept.members.map((m) => m.id));
  const available = allMembers.filter((m) => !memberIds.has(m.id));

  const saveName = () => {
    setEditing(false);
    const n = name.trim();
    if (!n || n === dept.name) {
      setName(dept.name);
      return;
    }
    start(async () => {
      const res = await renameDepartment(ws, dept.id, n);
      if (res.error) {
        toast.error(res.error);
        setName(dept.name);
      }
    });
  };

  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (ok) toast.success(ok);
    });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: dept.accent_color }}
          />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  setName(dept.name);
                  setEditing(false);
                }
              }}
              className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[15px] font-semibold text-text-1 outline-none focus-visible:border-brand"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="truncate text-[15px] font-semibold text-text-1 hover:text-brand"
            >
              {dept.name}
            </button>
          )}
          {dept.is_default ? (
            <span className="rounded-[6px] bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
              Default
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {!dept.is_default ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => setDefaultDepartment(ws, dept.id), "Default space set.")
                }
              >
                <Star />
                Make default
              </Button>
              {/* The one-click trash that used to sit here is gone. Deleting
                  a space unfiles its projects and removes its lists, and
                  deleteDepartment now requires the name typed out, so this
                  opens the same danger zone the space settings panel does. */}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${dept.name}`}
                className="text-text-3 hover:text-danger"
                disabled={pending}
                onClick={() => setDeleting(true)}
              >
                <Trash2 className="size-4" strokeWidth={1.5} />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {deleting ? (
        <div className="mt-3">
          <DeleteSpaceCard
            ws={ws}
            space={{
              id: dept.id,
              name: dept.name,
              slug: dept.slug,
              description: null,
              icon: null,
              accent_color: dept.accent_color,
              is_default: dept.is_default,
              archived_at: null,
            }}
            projectCount={dept.projectCount}
            listCount={dept.listCount}
            onDeleted={() => setDeleting(false)}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dept.members.length === 0 ? (
          <span className="text-[12.5px] text-text-3">No members yet.</span>
        ) : (
          dept.members.map((m) => (
            <span
              key={m.id}
              className="group flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-[12.5px]"
            >
              <PersonAvatar name={m.name} src={m.avatar_url} size={20} />
              <span className="text-text-1">{m.name}</span>
              <button
                aria-label={`Remove ${m.name}`}
                disabled={pending}
                onClick={() =>
                  run(() => removeDepartmentMember(ws, dept.id, m.id))
                }
                className="rounded-full p-0.5 text-text-3 hover:bg-danger-soft hover:text-danger"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </span>
          ))
        )}
        {available.length > 0 ? (
          <select
            aria-label="Add member"
            value=""
            disabled={pending}
            onChange={(e) => {
              const id = e.target.value;
              if (id) run(() => addDepartmentMember(ws, dept.id, id));
            }}
            className="h-7 rounded-[8px] border border-dashed border-border bg-surface px-2 text-[12.5px] text-text-2 outline-none focus-visible:border-brand"
          >
            <option value="">Add member</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </Card>
  );
}

export function DepartmentAdmin({
  ws,
  departments,
  allMembers,
}: {
  ws: string;
  departments: DeptAdminRow[];
  allMembers: DeptAdminMember[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-text-2">
        A space is an area of the studio. People see only the spaces they
        belong to, and executives see all of them. Keep names brand-blind,
        never a client name.
      </p>
      <CreateDepartment ws={ws} />
      {departments.map((d) => (
        <DepartmentCard key={d.id} ws={ws} dept={d} allMembers={allMembers} />
      ))}
    </div>
  );
}
