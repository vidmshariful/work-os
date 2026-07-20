"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSubProject } from "@/lib/actions/projects";
import type { MemberOption } from "./types";

const inputClass =
  "h-9 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// Add a sub-project to a parent. It inherits the parent's space, list, and
// client; you give it a title and an owner.
export function SubProjectAdd({
  ws,
  parentId,
  members,
}: {
  ws: string;
  parentId: string;
  members: MemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      const res = await createSubProject(ws, parentId, t, owner);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setTitle("");
      setOwner("");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Add sub-project
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sub-project title"
        className={`${inputClass} w-48`}
      />
      <select
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        aria-label="Owner"
        className={inputClass}
      >
        <option value="">Owner</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending || !title.trim()}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
