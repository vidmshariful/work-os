"use client";

import { useState, useTransition } from "react";
import { ArrowDownUp, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  addField,
  addRow,
  deleteField,
  deleteRow,
  renameField,
  updateCell,
} from "@/lib/actions/database";
import type { DbField, DbFieldType, DbRow } from "@/lib/types";

export interface MemberRef {
  id: string;
  full_name: string;
}

const TYPE_LABELS: Record<DbFieldType, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  checkbox: "Checkbox",
  select: "Select",
  multi_select: "Multi-select",
  url: "URL",
  email: "Email",
  phone: "Phone",
  person: "Person",
};

const HAS_CHOICES = (t: DbFieldType) => t === "select" || t === "multi_select";

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// Everything a row holds, flattened to text so search can scan it.
function rowText(row: DbRow, fields: DbField[], members: MemberRef[]) {
  return fields
    .map((f) => {
      const v = row.values?.[f.id];
      if (v == null) return "";
      if (f.type === "person") return members.find((m) => m.id === v)?.full_name ?? "";
      if (Array.isArray(v)) return v.join(" ");
      return String(v);
    })
    .join(" ")
    .toLowerCase();
}

const cellInput =
  "h-9 w-full min-w-[8rem] border-0 bg-transparent px-3 text-[13px] text-text-1 outline-none focus:bg-accent-soft/40";

export function TableGrid({
  ws,
  tableId,
  fields,
  rows,
  members,
  canEdit,
}: {
  ws: string;
  tableId: string;
  fields: DbField[];
  rows: DbRow[];
  members: MemberRef[];
  canEdit: boolean;
}) {
  const [, start] = useTransition();
  // Optimistic cell values layered over the server rows.
  const [overlay, setOverlay] = useState<Record<string, Record<string, unknown>>>({});

  const valueOf = (row: DbRow, fieldId: string) => {
    const o = overlay[row.id];
    if (o && fieldId in o) return o[fieldId];
    return row.values?.[fieldId];
  };

  const save = (rowId: string, fieldId: string, value: unknown) => {
    setOverlay((o) => ({ ...o, [rowId]: { ...(o[rowId] ?? {}), [fieldId]: value } }));
    start(async () => {
      const res = await updateCell(ws, tableId, rowId, fieldId, value);
      if (res.error) toast.error(res.error);
    });
  };

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  // ---- search, filter, sort (applied to the loaded rows) ----
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const [sortId, setSortId] = useState("");
  const [sortDesc, setSortDesc] = useState(false);

  const filterField = fields.find((f) => f.id === filterId) ?? null;
  const sortField = fields.find((f) => f.id === sortId) ?? null;

  let visible = rows;
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    visible = visible.filter((r) => rowText(r, fields, members).includes(q));
  }
  if (filterField && filterVal) {
    visible = visible.filter((r) => {
      const v = r.values?.[filterField.id];
      if (filterField.type === "multi_select") return asArray(v).includes(filterVal);
      if (filterField.type === "checkbox") return String(Boolean(v)) === filterVal;
      if (filterField.type === "select" || filterField.type === "person") {
        return String(v ?? "") === filterVal;
      }
      return String(v ?? "").toLowerCase().includes(filterVal.toLowerCase());
    });
  }
  if (sortField) {
    const dir = sortDesc ? -1 : 1;
    visible = [...visible].sort((a, b) => {
      const av = a.values?.[sortField.id];
      const bv = b.values?.[sortField.id];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortField.type === "number") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  const filterChoices = (): { value: string; label: string }[] => {
    if (!filterField) return [];
    if (filterField.type === "checkbox") {
      return [
        { value: "true", label: "Checked" },
        { value: "false", label: "Unchecked" },
      ];
    }
    if (filterField.type === "person") {
      return members.map((m) => ({ value: m.id, label: m.full_name }));
    }
    if (filterField.type === "select" || filterField.type === "multi_select") {
      return (filterField.options?.choices ?? []).map((c) => ({
        value: c.label,
        label: c.label,
      }));
    }
    return [];
  };
  const choices = filterChoices();
  const controlClass =
    "h-8 rounded-[8px] border border-border bg-surface px-2 text-[12.5px] text-text-2 outline-none focus-visible:border-brand";

  function Cell({ row, field }: { row: DbRow; field: DbField }) {
    const v = valueOf(row, field.id);

    if (!canEdit) {
      if (field.type === "checkbox") {
        return <span className="block px-3 py-2 text-[13px]">{v ? "Yes" : "—"}</span>;
      }
      if (field.type === "person") {
        const m = members.find((x) => x.id === v);
        return <span className="block px-3 py-2 text-[13px]">{m?.full_name ?? "—"}</span>;
      }
      if (field.type === "multi_select") {
        const vals = asArray(v);
        return (
          <span className="flex flex-wrap gap-1 px-3 py-2">
            {vals.length === 0 ? <span className="text-[13px]">—</span> : null}
            {vals.map((label) => (
              <Chip key={label} label={label} field={field} />
            ))}
          </span>
        );
      }
      if ((field.type === "url" || field.type === "email" || field.type === "phone") && v) {
        const href =
          field.type === "email"
            ? `mailto:${v}`
            : field.type === "phone"
              ? `tel:${v}`
              : String(v);
        return (
          <a
            href={href}
            target={field.type === "url" ? "_blank" : undefined}
            rel="noreferrer"
            className="block truncate px-3 py-2 text-[13px] text-brand hover:underline"
          >
            {String(v)}
          </a>
        );
      }
      return (
        <span className="block whitespace-pre-wrap px-3 py-2 text-[13px]">
          {v == null || v === "" ? "—" : String(v)}
        </span>
      );
    }

    switch (field.type) {
      case "checkbox":
        return (
          <span className="flex h-9 items-center px-3">
            <Checkbox
              checked={Boolean(v)}
              aria-label={field.name}
              onCheckedChange={(c) => save(row.id, field.id, c === true)}
            />
          </span>
        );
      case "select":
        return (
          <select
            value={typeof v === "string" ? v : ""}
            aria-label={field.name}
            onChange={(e) => save(row.id, field.id, e.target.value)}
            className={cellInput}
          >
            <option value="">—</option>
            {(field.options?.choices ?? []).map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        );
      case "person":
        return (
          <select
            value={typeof v === "string" ? v : ""}
            aria-label={field.name}
            onChange={(e) => save(row.id, field.id, e.target.value)}
            className={cellInput}
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        );
      case "multi_select":
        return (
          <MultiSelectCell
            field={field}
            selected={asArray(v)}
            onChange={(next) => save(row.id, field.id, next)}
          />
        );
      case "long_text":
        return (
          <textarea
            defaultValue={v == null ? "" : String(v)}
            aria-label={field.name}
            rows={1}
            onBlur={(e) => save(row.id, field.id, e.target.value)}
            className={cn(cellInput, "min-h-[36px] resize-y py-2 leading-snug")}
          />
        );
      case "number":
        return (
          <input
            type="number"
            defaultValue={v == null ? "" : String(v)}
            aria-label={field.name}
            onBlur={(e) =>
              save(row.id, field.id, e.target.value === "" ? "" : Number(e.target.value))
            }
            className={cellInput}
          />
        );
      case "date":
        return (
          <input
            type="date"
            defaultValue={typeof v === "string" ? v : ""}
            aria-label={field.name}
            onChange={(e) => save(row.id, field.id, e.target.value)}
            className={cellInput}
          />
        );
      default:
        return (
          <input
            type={
              field.type === "url"
                ? "url"
                : field.type === "email"
                  ? "email"
                  : field.type === "phone"
                    ? "tel"
                    : "text"
            }
            defaultValue={v == null ? "" : String(v)}
            aria-label={field.name}
            onBlur={(e) => save(row.id, field.id, e.target.value)}
            className={cellInput}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3"
            strokeWidth={1.5}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rows"
            aria-label="Search rows"
            className={cn(controlClass, "w-48 pl-8")}
          />
        </span>

        <select
          value={filterId}
          aria-label="Filter field"
          onChange={(e) => {
            setFilterId(e.target.value);
            setFilterVal("");
          }}
          className={controlClass}
        >
          <option value="">Filter by</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {filterField ? (
          choices.length > 0 ? (
            <select
              value={filterVal}
              aria-label="Filter value"
              onChange={(e) => setFilterVal(e.target.value)}
              className={controlClass}
            >
              <option value="">Any</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
              placeholder="contains…"
              aria-label="Filter value"
              className={cn(controlClass, "w-36")}
            />
          )
        ) : null}

        <select
          value={sortId}
          aria-label="Sort field"
          onChange={(e) => setSortId(e.target.value)}
          className={controlClass}
        >
          <option value="">Sort by</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {sortField ? (
          <button
            onClick={() => setSortDesc((d) => !d)}
            aria-label={sortDesc ? "Sort ascending" : "Sort descending"}
            className={cn(controlClass, "flex items-center gap-1 px-2 hover:text-text-1")}
          >
            <ArrowDownUp className="size-3.5" strokeWidth={1.5} />
            {sortDesc ? "Desc" : "Asc"}
          </button>
        ) : null}

        {query || filterVal || sortId ? (
          <button
            onClick={() => {
              setQuery("");
              setFilterId("");
              setFilterVal("");
              setSortId("");
            }}
            className="text-[12.5px] font-medium text-brand hover:underline"
          >
            Clear
          </button>
        ) : null}

        <span className="ml-auto text-[12.5px] text-text-3">
          <span className="font-mono tabular">{visible.length}</span>
          {visible.length === rows.length ? " rows" : ` of ${rows.length} rows`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {fields.map((f) => (
                <th key={f.id} className="border-r border-border p-0 text-left last:border-r-0">
                  <FieldHeader ws={ws} tableId={tableId} field={f} canEdit={canEdit} onRun={run} />
                </th>
              ))}
              {canEdit ? (
                <th className="w-12 p-0">
                  <AddFieldPopover ws={ws} tableId={tableId} onRun={run} />
                </th>
              ) : null}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="group border-b border-border last:border-b-0 hover:bg-surface-2/60">
                {fields.map((f) => (
                  <td key={f.id} className="border-r border-border p-0 align-top last:border-r-0">
                    <Cell row={r} field={f} />
                  </td>
                ))}
                {canEdit ? <td /> : null}
                <td className="px-1">
                  {canEdit ? (
                    <button
                      aria-label="Delete row"
                      onClick={() => run(() => deleteRow(ws, tableId, r.id))}
                      className="rounded-[6px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.5} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 2} className="px-4 py-8 text-center text-[13px] text-text-3">
                  {rows.length === 0 ? "No rows yet." : "No rows match those filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => run(() => addRow(ws, tableId))}>
            <Plus />
            New row
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, field }: { label: string; field: DbField }) {
  const color =
    field.options?.choices?.find((c) => c.label === label)?.color ?? "#8A94A3";
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

function MultiSelectCell({
  field,
  selected,
  onChange,
}: {
  field: DbField;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = field.options?.choices ?? [];

  const toggle = (label: string) => {
    const next = selected.includes(label)
      ? selected.filter((s) => s !== label)
      : [...selected, label];
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex min-h-9 w-full flex-wrap items-center gap-1 px-3 py-1.5 text-left hover:bg-accent-soft/40">
          {selected.length === 0 ? (
            <span className="text-[13px] text-text-3">—</span>
          ) : (
            selected.map((label) => <Chip key={label} label={label} field={field} />)
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52">
        {choices.length === 0 ? (
          <p className="text-[12.5px] text-text-3">
            No choices defined for this field.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {choices.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => toggle(c.label)}
                className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <Checkbox checked={selected.includes(c.label)} aria-label={c.label} />
                <span className="text-[13px] text-text-1">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FieldHeader({
  ws,
  tableId,
  field,
  canEdit,
  onRun,
}: {
  ws: string;
  tableId: string;
  field: DbField;
  canEdit: boolean;
  onRun: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(field.name);

  if (!canEdit) {
    return (
      <span className="block px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-3">
        {field.name}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="block w-full px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-3 hover:text-text-1">
          {field.name}
          <span className="ml-1.5 font-normal normal-case text-text-3">
            {TYPE_LABELS[field.type]}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand"
          />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-text-3 hover:text-danger"
              onClick={() => {
                onRun(() => deleteField(ws, tableId, field.id));
                setOpen(false);
              }}
            >
              <Trash2 />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onRun(() => renameField(ws, tableId, field.id, name));
                setOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddFieldPopover({
  ws,
  tableId,
  onRun,
}: {
  ws: string;
  tableId: string;
  onRun: (fn: () => Promise<{ error: string | null }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<DbFieldType>("text");
  const [choices, setChoices] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onRun(() =>
      addField(ws, tableId, name, type, choices.split(",").map((c) => c.trim()))
    );
    setName("");
    setChoices("");
    setType("text");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Add field"
          className="flex h-full w-full items-center justify-center py-2 text-text-3 hover:text-text-1"
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name"
            className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DbFieldType)}
            className="h-9 w-full rounded-[9px] border border-border bg-surface px-2.5 text-sm text-text-1 outline-none focus-visible:border-brand"
          >
            {(Object.keys(TYPE_LABELS) as DbFieldType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {HAS_CHOICES(type) ? (
            <input
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
              placeholder="Choices, comma separated"
              className="h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand"
            />
          ) : null}
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Add field
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
