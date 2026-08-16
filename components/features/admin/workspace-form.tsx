"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import { updateWorkspace } from "@/lib/actions/admin";
import { ACCENT_PRESETS } from "./shared";
import { cn } from "@/lib/utils";

export function WorkspaceForm({
  ws,
  name: initialName,
  accentColor: initialAccent,
}: {
  ws: string;
  name: string;
  accentColor: string;
}) {
  const [name, setName] = useState(initialName);
  const [accent, setAccent] = useState(initialAccent);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await updateWorkspace(ws, { name, accent_color: accent });
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else toast.success("Workspace updated.");
    });

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Field label="Workspace name" htmlFor="ws_name">
        <input
          id="ws_name"
          className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Accent color" hint="Shown in the workspace rail.">
        <div className="flex items-center gap-2">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Accent ${color}`}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-transform",
                accent === color && "scale-110 ring-2 ring-offset-2 ring-offset-surface"
              )}
              style={{ backgroundColor: color, ...(accent === color ? { ["--tw-ring-color" as string]: color } : {}) }}
              onClick={() => setAccent(color)}
            >
              {accent === color ? <Check className="size-4 text-white" /> : null}
            </button>
          ))}
        </div>
      </Field>
      <div>
        <Button disabled={pending} onClick={save}>
          {pending ? "Saving" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
