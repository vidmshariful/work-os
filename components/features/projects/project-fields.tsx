"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  sameValue,
  type Edit,
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
//
// WHY THE EDIT STATE LIVES HERE AND NOT IN THE ROW. Picking a value used to
// take about four seconds to show up: the action re-rendered the whole page,
// then router.refresh() re-rendered it a second time, and the chip only moved
// when the second one landed. The write itself takes about ninety
// milliseconds. So the value is now drawn from the click and the round trip
// happens behind it.
//
// The overrides sit in this component because the header counts filled
// fields. If a row owned its own optimistic value, the row and the counter
// six pixels above it would disagree for a second every time. One map, both
// readers.
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
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const seqRef = useRef<Record<string, number>>({});

  // An override is dropped the moment the server agrees with it. Until then
  // it stands, which is what keeps the value on screen correct in the modal
  // route, where the revalidated tree may never reach this component.
  //
  // edits is a dependency as well as fields, because a write that settles on
  // the value the server already held changes nothing about fields and would
  // otherwise leave an override sitting there for good, deaf to anything
  // anyone else changed afterwards.
  useEffect(() => {
    setEdits((prev) => {
      let changed = false;
      const next: Record<string, Edit> = {};
      for (const [id, edit] of Object.entries(prev)) {
        const server = fields.find((f) => f.field.id === id);
        if (!edit.pending && server && sameValue(server.value, edit.value)) {
          changed = true;
          continue;
        }
        next[id] = edit;
      }
      // Returning prev unchanged is what stops this from looping.
      return changed ? next : prev;
    });
  }, [fields, edits]);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // The write a timer is holding, so it can be sent rather than lost.
  const armed = useRef<Record<string, () => void>>({});

  // Unmounting with a write still scheduled would throw it away silently, and
  // silently is the whole problem: the value already moved on screen, so the
  // person has no reason to think anything failed. Closing the floating panel
  // just after a click is an ordinary thing to do. So the cleanup sends what
  // is waiting instead of cancelling it.
  useEffect(() => {
    const held = timers.current;
    const waiting = armed.current;
    return () => {
      for (const [id, t] of Object.entries(held)) {
        clearTimeout(t);
        waiting[id]?.();
      }
    };
  }, []);

  // delay is for the controls that fire in bursts: a date box emits an empty
  // value on the way from one date to another, and the multi choice menu
  // stays open across clicks. Those coalesce into one write. The value on
  // screen still changes on the click either way.
  const save = useCallback(
    (field: ProjectField, next: unknown, delay = 0) => {
      const seq = (seqRef.current[field.id] ?? 0) + 1;
      seqRef.current[field.id] = seq;
      setEdits((prev) => ({ ...prev, [field.id]: { value: next, seq, pending: true } }));

      const revert = () =>
        setEdits((prev) => {
          const copy = { ...prev };
          delete copy[field.id];
          return copy;
        });

      const dispatch = async () => {
        let res;
        try {
          res = await setProjectFieldValue(ws, projectId, field.id, next);
        } catch {
          // A server action rejects rather than returns when the request does
          // not complete: offline, a 500, a session that lapsed into a
          // redirect, or a deploy that moved the action. Without this the
          // value stays on screen as though it saved, and stays pending, so
          // nothing ever corrects it.
          if (seqRef.current[field.id] !== seq) return;
          toast.error(`${field.name} could not be saved. Check your connection and try again.`);
          revert();
          return;
        }
        // A later click has already been sent, so this answer is history.
        if (seqRef.current[field.id] !== seq) return;
        if (res.error) {
          // The field is named because the toast appears in the corner and
          // there can be nine rows in this card.
          toast.error(`${field.name}: ${res.error}`);
          revert();
          return;
        }
        // Settle on what was stored, not on what was typed: the server trims
        // text, coerces numbers and dedupes choices.
        setEdits((prev) => ({
          ...prev,
          [field.id]: { value: res.value ?? null, seq, pending: false },
        }));
      };

      const running = timers.current[field.id];
      if (running) clearTimeout(running);
      delete armed.current[field.id];
      if (delay > 0) {
        const fire = () => {
          delete armed.current[field.id];
          delete timers.current[field.id];
          void dispatch();
        };
        armed.current[field.id] = fire;
        timers.current[field.id] = setTimeout(fire, delay);
      } else {
        void dispatch();
      }
    },
    [ws, projectId]
  );

  if (fields.length === 0) return null;

  const rows = fields.map((f) => {
    const edit = edits[f.field.id];
    return { field: f.field, value: edit ? edit.value : f.value, pending: Boolean(edit?.pending) };
  });

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
          {rows.filter((f) => !isEmpty(f.value)).length} of {rows.length}
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-border border-t border-border">
          {rows.map((f) => (
            <FieldRow
              key={f.field.id}
              field={f.field}
              value={f.value}
              pending={f.pending}
              canEdit={canEdit}
              onSave={save}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

// An unticked checkbox is empty, the same way the server treats it, so the
// counter cannot drift from what is stored.
function isEmpty(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    v === false ||
    (Array.isArray(v) && v.length === 0)
  );
}

function FieldRow({
  field,
  value,
  pending,
  canEdit,
  onSave,
}: {
  field: ProjectField;
  // Already folded: the edit in flight if there is one, else the server's.
  value: unknown;
  pending: boolean;
  canEdit: boolean;
  onSave: (field: ProjectField, next: unknown, delay?: number) => void;
}) {
  const asText = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(asText);
  const focused = useRef(false);

  // The typed kinds keep a draft so the caret does not jump while typing.
  // It is reseeded when the value changes underneath and the box is not in
  // use, which is what stops a refused edit from sitting in the input and
  // being sent again by the next blur.
  useEffect(() => {
    if (!focused.current) setDraft(asText);
  }, [asText]);

  return (
    <PropertyRow label={field.name} pending={pending}>
      <FieldControl
        field={field}
        value={value}
        draft={draft}
        setDraft={setDraft}
        onFocusChange={(v) => (focused.current = v)}
        canEdit={canEdit}
        onSave={(next, delay) => onSave(field, next, delay)}
      />
    </PropertyRow>
  );
}

function FieldControl({
  field,
  value,
  draft,
  setDraft,
  onFocusChange,
  canEdit,
  onSave,
}: {
  field: ProjectField;
  value: unknown;
  draft: string;
  setDraft: (v: string) => void;
  // Told when a text box is in use, so the draft is not reseeded under the
  // caret while someone is typing in it.
  onFocusChange: (focused: boolean) => void;
  canEdit: boolean;
  // delay coalesces a burst of changes into one write.
  onSave: (next: unknown, delay?: number) => void;
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
                      : [...picked, o.value],
                    350
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
            onFocus={() => onFocusChange(true)}
            onBlur={() => {
              onFocusChange(false);
              if (draft !== String(value ?? "")) onSave(draft);
            }}
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
          onFocus={() => onFocusChange(true)}
          onBlur={() => {
            onFocusChange(false);
            if (draft !== String(value ?? "")) onSave(draft);
          }}
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
            onSave(e.target.value, 350);
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
          onFocus={() => onFocusChange(true)}
          onBlur={() => {
            onFocusChange(false);
            if (draft !== String(value ?? "")) onSave(draft);
          }}
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
