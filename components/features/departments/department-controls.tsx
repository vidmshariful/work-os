"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createList, deleteList } from "@/lib/actions/departments";

const inputClass =
  "h-8 w-44 rounded-[9px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

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

export function DeleteListButton({
  ws,
  listId,
  slug,
}: {
  ws: string;
  listId: string;
  slug: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      aria-label="Remove list"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deleteList(ws, listId, slug);
          if (res.error) toast.error(res.error);
        })
      }
      className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover/list:opacity-100"
    >
      <X className="size-3.5" strokeWidth={1.5} />
    </button>
  );
}
