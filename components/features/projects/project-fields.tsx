"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, Sliders } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/primitives/card";
import { Tag, isTagTone, type TagTone } from "@/components/primitives/tag";
import {
  EmptyValue,
  PropertyRow,
  propertyInputClass as inputClass,
  propertyTriggerClass,
} from "@/components/features/projects/property-row";
import { setProjectFieldValue } from "@/lib/actions/project-fields";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectField, ProjectFieldOption } from "@/lib/types";

export interface FieldWithValue {
  field: ProjectField;
  value: unknown;
}

const tone = (o: ProjectFieldOption | undefined): TagTone =>
  o?.color && isTagTone(o.color) ? o.color : "gray";

// The Fields block from the ClickUp task view: label on the left, the value
// on the right, edited where it is read. Empty reads as "Empty" in muted
// text rather than as a blank, so a field that exists but is unset is
// visibly different from one that does not exist.
export function ProjectFields({
  ws,
  projectId,
  fields,
  canEdit,
}: {
  ws: string;
  projectId: string;
  fields: FieldWithValue[];
  // projects_update allows a manager on any project or the owner on theirs,
  // so this is decided per project, not per page.
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (fields.length === 0) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ChevronDown
          className={cn("size-4 text-text-3 transition-transform", !open && "-rotate-90")}
          strokeWidth={2}
        />
        <Sliders className="size-4 text-text-3" strokeWidth={1.5} />
        <span className="text-sm font-semibold text-text-1">Fields</span>
        <span className="ml-auto font-mono text-[11.5px] text-text-3 tabular">
          {fields.filter((f) => !isEmpty(f.value)).length} of {fields.length}
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-border border-t border-border">
          {fields.map((f) => (
            <FieldRow
              key={f.field.id}
              ws={ws}
              projectId={projectId}
              field={f.field}
              value={f.value}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function FieldRow({
  ws,
  projectId,
  field,
  value,
  canEdit,
}: {
  ws: string;
  projectId: string;
  field: ProjectField;
  value: unknown;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(
    value === null || value === undefined ? "" : String(value)
  );

  const save = (next: unknown) =>
    start(async () => {
      const res = await setProjectFieldValue(ws, projectId, field.id, next);
      if (res.error) {
        toast.error(res.error);
        // Put the field back to what the server still holds, so a refused
        // edit does not leave a value on screen that was never saved.
        setDraft(value === null || value === undefined ? "" : String(value));
        return;
      }
      router.refresh();
    });

  return (
    <PropertyRow label={field.name} pending={pending}>
      <FieldControl
        field={field}
        value={value}
        draft={draft}
        setDraft={setDraft}
        canEdit={canEdit}
        onSave={save}
      />
    </PropertyRow>
  );
}

function FieldControl({
  field,
  value,
  draft,
  setDraft,
  canEdit,
  onSave,
}: {
  field: ProjectField;
  value: unknown;
  draft: string;
  setDraft: (v: string) => void;
  canEdit: boolean;
  onSave: (next: unknown) => void;
}) {
  const empty = <EmptyValue />;
  const options = field.options ?? [];

  switch (field.kind) {
    case "select": {
      const current = options.find((o) => o.value === value);
      if (!canEdit) {
        return current ? (
          <Tag tone={tone(current)}>{current.label}</Tag>
        ) : (
          empty
        );
      }
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Set ${field.name}`}
              className={propertyTriggerClass}
            >
              {current ? <Tag tone={tone(current)}>{current.label}</Tag> : empty}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {options.map((o) => (
              <DropdownMenuItem key={o.value} onSelect={() => onSave(o.value)}>
                <Check
                  strokeWidth={2}
                  className={cn(value !== o.value && "opacity-0")}
                />
                <Tag tone={tone(o)}>{o.label}</Tag>
              </DropdownMenuItem>
            ))}
            {value ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onSave(null)}>Clear</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    case "multi_select": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      const chips = options.filter((o) => picked.includes(o.value));
      if (!canEdit) {
        return chips.length ? (
          <span className="flex flex-wrap gap-1">
            {chips.map((o) => (
              <Tag key={o.value} tone={tone(o)}>
                {o.label}
              </Tag>
            ))}
          </span>
        ) : (
          empty
        );
      }
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Set ${field.name}`}
              className={propertyTriggerClass}
            >
              {chips.length ? (
                <span className="flex flex-wrap gap-1">
                  {chips.map((o) => (
                    <Tag key={o.value} tone={tone(o)}>
                      {o.label}
                    </Tag>
                  ))}
                </span>
              ) : (
                empty
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.value}
                checked={picked.includes(o.value)}
                onSelect={(e) => {
                  e.preventDefault();
                  onSave(
                    picked.includes(o.value)
                      ? picked.filter((v) => v !== o.value)
                      : [...picked, o.value]
                  );
                }}
              >
                <Tag tone={tone(o)}>{o.label}</Tag>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    case "checkbox": {
      const on = value === true;
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-label={field.name}
          disabled={!canEdit}
          onClick={() => onSave(!on)}
          className={cn(
            "ml-2 flex size-4 items-center justify-center rounded-[5px] border transition-colors",
            on ? "border-brand bg-brand text-white" : "border-border-strong",
            !canEdit && "opacity-60"
          )}
        >
          {on ? <Check className="size-3" strokeWidth={3} /> : null}
        </button>
      );
    }

    case "url": {
      if (!canEdit) {
        return value ? (
          <a
            href={String(value)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 text-[13px] text-brand hover:underline"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.5} />
            {shortUrl(String(value))}
          </a>
        ) : (
          empty
        );
      }
      return (
        <div className="flex items-center gap-1">
          <input
            value={draft}
            placeholder="Empty"
            aria-label={field.name}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== (value ?? "") && onSave(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(String(value ?? ""));
                e.currentTarget.blur();
              }
            }}
            className={inputClass}
          />
          {value ? (
            <a
              href={String(value)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${field.name}`}
              className="shrink-0 rounded-[7px] p-1 text-text-3 hover:text-brand"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.5} />
            </a>
          ) : null}
        </div>
      );
    }

    case "long_text": {
      if (!canEdit) {
        return value ? (
          <p className="whitespace-pre-wrap px-2 text-[13px] text-text-1">{String(value)}</p>
        ) : (
          empty
        );
      }
      return (
        <textarea
          value={draft}
          rows={3}
          placeholder="Empty"
          aria-label={field.name}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== (value ?? "") && onSave(draft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(String(value ?? ""));
              e.currentTarget.blur();
            }
          }}
          className={cn(inputClass, "resize-y")}
        />
      );
    }

    case "date": {
      if (!canEdit) {
        return value ? (
          <span className="px-2 font-mono text-[13px] text-text-1 tabular">
            {fmtDate(String(value))}
          </span>
        ) : (
          empty
        );
      }
      return (
        <input
          type="date"
          value={draft}
          aria-label={field.name}
          onChange={(e) => {
            setDraft(e.target.value);
            onSave(e.target.value);
          }}
          className={cn(inputClass, "font-mono tabular")}
        />
      );
    }

    default: {
      // text and number
      if (!canEdit) {
        return value !== null && value !== undefined && value !== "" ? (
          <span
            className={cn(
              "px-2 text-[13px] text-text-1",
              field.kind === "number" && "font-mono tabular"
            )}
          >
            {String(value)}
          </span>
        ) : (
          empty
        );
      }
      return (
        <input
          value={draft}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          placeholder="Empty"
          aria-label={field.name}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== String(value ?? "") && onSave(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(String(value ?? ""));
              e.currentTarget.blur();
            }
          }}
          className={cn(inputClass, field.kind === "number" && "font-mono tabular")}
        />
      );
    }
  }
}

// A full Drive or Figma URL is unreadable in a narrow column, so the host
// and the tail carry the meaning.
function shortUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const tail = u.pathname.split("/").filter(Boolean).pop();
    return tail ? `${host}/${tail.slice(0, 24)}` : host;
  } catch {
    return raw.slice(0, 40);
  }
}
