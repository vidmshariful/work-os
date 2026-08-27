"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/primitives/card";
import { Tag, TAG_TONES, isTagTone, toneDotClass, type TagTone } from "@/components/primitives/tag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createProjectField,
  deleteProjectField,
  reorderProjectFields,
  updateProjectField,
} from "@/lib/actions/project-fields";
import { cn } from "@/lib/utils";
import type { ProjectField, ProjectFieldKind, ProjectFieldOption } from "@/lib/types";

export interface Folder {
  id: string;
  name: string;
  department_id: string;
}

export interface FieldAdminRow extends ProjectField {
  // How many projects have a value, quoted in the delete confirmation so it
  // says what will really happen.
  valueCount: number;
}

const KINDS: { value: ProjectFieldKind; label: string; hint: string }[] = [
  { value: "text", label: "Text", hint: "One line" },
  { value: "long_text", label: "Long text", hint: "A paragraph, like a script" },
  { value: "number", label: "Number", hint: "" },
  { value: "date", label: "Date", hint: "" },
  { value: "select", label: "Choice", hint: "Pick one, shown as a coloured chip" },
  { value: "multi_select", label: "Multi choice", hint: "Pick several" },
  { value: "url", label: "Link", hint: "A Drive or Figma URL" },
  { value: "checkbox", label: "Checkbox", hint: "Yes or no" },
];

const kindLabel = (k: ProjectFieldKind) =>
  KINDS.find((x) => x.value === k)?.label ?? k;
const isChoice = (k: ProjectFieldKind) => k === "select" || k === "multi_select";

const inputClass =
  "h-8 rounded-[9px] border border-border bg-surface px-2.5 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function FieldAdmin({
  ws,
  fields,
  spaces,
  folders,
}: {
  ws: string;
  fields: FieldAdminRow[];
  spaces: { id: string; name: string }[];
  folders: Folder[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-text-2">
        Fields appear on every project page, in this order. A field scoped to
        one space only shows on projects in that space, so Production can
        carry an editing stage that Sales never sees, and one scoped to a
        folder inside a space narrows it further still. Keep names brand-blind:
        a field called Client would put brand identity somewhere the wall does
        not protect.
      </p>

      <CreateField ws={ws} spaces={spaces} folders={folders} />

      {fields.length === 0 ? (
        <Card>
          <p className="px-5 py-6 text-center text-meta text-text-3">
            No fields yet. The first one you add shows on every project.
          </p>
        </Card>
      ) : (
        fields.map((f, i) => (
          <FieldRow
            key={f.id}
            ws={ws}
            field={f}
            spaces={spaces}
            folders={folders}
            first={i === 0}
            last={i === fields.length - 1}
            onMove={(dir) => {
              const ids = fields.map((x) => x.id);
              const to = dir === "up" ? i - 1 : i + 1;
              if (to < 0 || to >= ids.length) return;
              [ids[i], ids[to]] = [ids[to], ids[i]];
              return ids;
            }}
          />
        ))
      )}
    </div>
  );
}

function CreateField({
  ws,
  spaces,
  folders,
}: {
  ws: string;
  spaces: { id: string; name: string }[];
  folders: Folder[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectFieldKind>("text");
  const [spaceId, setSpaceId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [choices, setChoices] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const options: ProjectFieldOption[] = isChoice(kind)
        ? choices
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((label, i) => ({
              value: slugify(label),
              label,
              color: TAG_TONES[i % TAG_TONES.length],
            }))
        : [];
      const res = await createProjectField(ws, {
        name,
        kind,
        options,
        departmentId: spaceId || null,
        folderId: folderId || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setChoices("");
      setOpen(false);
      toast.success(`${name.trim()} added.`);
      router.refresh();
    });

  if (!open) {
    return (
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus />
          New field
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-text-2">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Active Prod. Stage"
            aria-label="Field name"
            className={cn(inputClass, "w-56")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-text-2">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectFieldKind)}
            aria-label="Field type"
            className={cn(inputClass, "w-40")}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-text-2">Shows in</span>
          <select
            value={spaceId}
            onChange={(e) => {
              setSpaceId(e.target.value);
              // A folder only means something inside its own space, so
              // changing the space clears it rather than leaving a stale one.
              setFolderId("");
            }}
            aria-label="Field scope"
            className={cn(inputClass, "w-44")}
          >
            <option value="">Every space</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} only
              </option>
            ))}
          </select>
        </label>
        {/* Only offered once a space is picked, and only when that space has
            folders. Narrower than the space: the field then appears on
            projects filed in this folder and nowhere else. */}
        {spaceId && folders.some((f) => f.department_id === spaceId) ? (
          <label className="block">
            <span className="mb-1 block text-meta font-medium text-text-2">Folder</span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              aria-label="Folder scope"
              className={cn(inputClass, "w-44")}
            >
              <option value="">The whole space</option>
              {folders
                .filter((f) => f.department_id === spaceId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} only
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {isChoice(kind) ? (
          <label className="block flex-1">
            <span className="mb-1 block text-meta font-medium text-text-2">
              Choices, separated by commas
            </span>
            <input
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
              placeholder="Not started, Running, Blocked"
              aria-label="Choices"
              className={cn(inputClass, "w-full min-w-[220px]")}
            />
          </label>
        ) : null}
        <Button size="sm" disabled={pending || !name.trim()} onClick={submit}>
          Add field
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 text-label text-text-3">
        {KINDS.find((k) => k.value === kind)?.hint ||
          "The type cannot be changed later, because every saved value is in its shape."}
      </p>
    </Card>
  );
}

function FieldRow({
  ws,
  field,
  spaces,
  folders,
  first,
  last,
  onMove,
}: {
  ws: string;
  field: FieldAdminRow;
  spaces: { id: string; name: string }[];
  folders: Folder[];
  first: boolean;
  last: boolean;
  onMove: (dir: "up" | "down") => string[] | undefined;
}) {
  const router = useRouter();
  const [name, setName] = useState(field.name);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });

  const saveName = () => {
    setEditing(false);
    const clean = name.trim();
    if (!clean || clean === field.name) {
      setName(field.name);
      return;
    }
    run(() => updateProjectField(ws, field.id, { name: clean }));
  };

  const setOptions = (options: ProjectFieldOption[]) =>
    run(() => updateProjectField(ws, field.id, { options }));

  const folder = field.folder_id
    ? folders.find((f) => f.id === field.folder_id) ?? null
    : null;
  const scope = folder
    ? folder.name
    : field.department_id
      ? spaces.find((s) => s.id === field.department_id)?.name ?? "one space"
      : null;
  const spaceFolders = folders.filter((f) => f.department_id === field.department_id);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label={`Move ${field.name} earlier`}
            disabled={first || pending}
            onClick={() => {
              const ids = onMove("up");
              if (ids) run(() => reorderProjectFields(ws, ids));
            }}
            className="rounded-[6px] p-0.5 text-text-3 hover:text-text-1 disabled:opacity-30"
          >
            <ChevronUp className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={`Move ${field.name} later`}
            disabled={last || pending}
            onClick={() => {
              const ids = onMove("down");
              if (ids) run(() => reorderProjectFields(ws, ids));
            }}
            className="rounded-[6px] p-0.5 text-text-3 hover:text-text-1 disabled:opacity-30"
          >
            <ChevronDown className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(field.name);
                setEditing(false);
              }
            }}
            aria-label={`Rename ${field.name}`}
            className={cn(inputClass, "w-56 text-lead font-semibold")}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${field.name}`}
            className="text-lead font-semibold text-text-1 hover:text-brand"
          >
            {field.name}
          </button>
        )}

        <span className="rounded-[6px] bg-chip-gray px-1.5 py-0.5 text-label font-medium text-text-2">
          {kindLabel(field.kind)}
        </span>

        <select
          value={field.department_id ?? ""}
          disabled={pending}
          aria-label={`Which spaces show ${field.name}`}
          onChange={(e) =>
            run(() =>
              // Changing the space drops the folder with it, because a folder
              // in another space would put the field somewhere nobody chose.
              updateProjectField(ws, field.id, {
                departmentId: e.target.value || null,
                folderId: null,
              })
            )
          }
          className={cn(inputClass, "h-7 w-44 text-meta")}
        >
          <option value="">Every space</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} only
            </option>
          ))}
        </select>

        {/* Shown only when the field is in a space that has folders, because
            outside one it has nothing to narrow to. */}
        {field.department_id && spaceFolders.length > 0 ? (
          <select
            value={field.folder_id ?? ""}
            disabled={pending}
            aria-label={`Which folder shows ${field.name}`}
            onChange={(e) =>
              run(() =>
                updateProjectField(ws, field.id, { folderId: e.target.value || null })
              )
            }
            className={cn(inputClass, "h-7 w-44 text-meta")}
          >
            <option value="">The whole space</option>
            {spaceFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} only
              </option>
            ))}
          </select>
        ) : null}

        <span className="ml-auto font-mono text-label text-text-3 tabular">
          {field.valueCount} set
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${field.name}`}
          className="text-text-3 hover:text-danger"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </div>

      {isChoice(field.kind) ? (
        <ChoiceEditor
          options={field.options ?? []}
          disabled={pending}
          onChange={setOptions}
        />
      ) : null}

      {scope ? (
        <p className="mt-2 text-label text-text-3">
          Only on projects in {scope}.
        </p>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {field.name}?</DialogTitle>
            <DialogDescription>
              {field.valueCount === 0
                ? "No project has a value for this field, so nothing is lost."
                : `${field.valueCount} project${
                    field.valueCount === 1 ? "" : "s"
                  } have a value for this field. Deleting it erases ${
                    field.valueCount === 1 ? "that value" : "those values"
                  } too, and that cannot be undone. The projects themselves are untouched.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                start(async () => {
                  const res = await deleteProjectField(ws, field.id);
                  if (res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(
                    res.cleared === 0
                      ? "Field deleted."
                      : `Field deleted, and ${res.cleared} value${
                          res.cleared === 1 ? "" : "s"
                        } cleared.`
                  );
                  router.refresh();
                });
              }}
            >
              {field.valueCount === 0
                ? "Delete field"
                : `Delete field and ${field.valueCount} value${
                    field.valueCount === 1 ? "" : "s"
                  }`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Choices are edited in place. The stored value is generated from the label
// once, at creation, and never rewritten: relabelling "Running" to "In
// flight" keeps every project that already chose it.
function ChoiceEditor({
  options,
  disabled,
  onChange,
}: {
  options: ProjectFieldOption[];
  disabled: boolean;
  onChange: (next: ProjectFieldOption[]) => void;
}) {
  const [adding, setAdding] = useState("");

  const tone = (o: ProjectFieldOption): TagTone =>
    o.color && isTagTone(o.color) ? o.color : "gray";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {options.map((o, i) => (
        <span key={o.value} className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Change the colour of ${o.label}`}
                className="rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Tag tone={tone(o)}>{o.label}</Tag>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {TAG_TONES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() =>
                    onChange(options.map((x, j) => (j === i ? { ...x, color: t } : x)))
                  }
                >
                  <span className={cn("size-2.5 rounded-full", toneDotClass(t))} />
                  <span className="capitalize">{t}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onChange(options.filter((_, j) => j !== i))}
              >
                <X strokeWidth={1.5} />
                Remove choice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ))}
      <input
        value={adding}
        disabled={disabled}
        placeholder="Add a choice"
        aria-label="Add a choice"
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const label = adding.trim();
          if (!label) return;
          const value = slugify(label);
          if (options.some((o) => o.value === value)) {
            toast.error("That choice already exists.");
            return;
          }
          setAdding("");
          onChange([
            ...options,
            { value, label, color: TAG_TONES[options.length % TAG_TONES.length] },
          ]);
        }}
        className={cn(inputClass, "h-7 w-36 text-meta")}
      />
    </div>
  );
}
