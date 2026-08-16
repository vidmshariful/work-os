"use client";

import { useState, useTransition } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createFolder, createList } from "@/lib/actions/departments";

const inputClass =
  "h-8 w-44 rounded-[9px] border border-border bg-surface px-2.5 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export function NewListForm({
  ws,
  departmentId,
  slug,
}: {
  ws: string;
  departmentId: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const res = await createList(ws, departmentId, slug, n);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        New list
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        className={inputClass}
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// A folder groups lists inside one space. Same shape as NewListForm, because
// it is the same gesture one level up.
export function NewFolderForm({
  ws,
  departmentId,
  slug,
}: {
  ws: string;
  departmentId: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const res = await createFolder(ws, slug, departmentId, n);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setOpen(false);
      toast.success(`${n} added.`);
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus />
        New folder
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        aria-label="Folder name"
        placeholder="Folder name"
        className={inputClass}
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// The bare delete button that used to live on each list header is gone. It
// removed a list on one click with nothing said about the projects inside
// it. Delete now sits in the list overflow menu behind a confirmation that
// names the count, in list-controls.tsx.
