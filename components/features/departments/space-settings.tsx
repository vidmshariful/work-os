"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ARCHETYPE_LABELS, ACCENT_PRESETS } from "@/components/features/admin/shared";
import {
  addDepartmentMember,
  createDepartment,
  deleteDepartment,
  removeDepartmentMember,
  setDefaultDepartment,
  setDepartmentArchived,
  updateDepartment,
} from "@/lib/actions/departments";
import { cn } from "@/lib/utils";
import { SpaceGlyph } from "./space-glyph";
import { SPACE_ICONS, SPACE_ICON_NAMES } from "./space-icons";
import type { Archetype } from "@/lib/types";

// Re-exported: it used to live here, and half the app imports it from
// this path.
export { SpaceGlyph };

export interface SpacePerson {
  id: string;
  name: string;
  avatar_url: string | null;
  archetype: Archetype;
}

export interface SpaceSettingsSpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  accent_color: string;
  is_default: boolean;
  archived_at: string | null;
}

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// Creating a space asks for the two things it cannot be without: a name and
// a colour. Everything else lives in the settings panel, which is where the
// person lands next anyway.
export function NewSpaceButton({
  ws,
  variant = "default",
}: {
  ws: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(ACCENT_PRESETS[0]);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const clean = name.trim();
      if (!clean) return;
      const res = await createDepartment(ws, clean, color);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setOpen(false);
      toast.success(`${clean} created.`);
      router.refresh();
    });

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus strokeWidth={1.5} />
        New space
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New space</DialogTitle>
            <DialogDescription>
              A space is an area of the studio. Only people you add to it will
              see its projects, so keep the name brand-blind, never a client
              name.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <SpaceGlyph name={name || "?"} icon={null} color={color} size={40} />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                aria-label="Space name"
                placeholder="Space name"
                className={cn(inputClass, "flex-1")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className="flex size-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${c}2A` }}
                >
                  <span
                    className="flex size-4 items-center justify-center rounded-full"
                    style={{ backgroundColor: c }}
                  >
                    {color === c ? (
                      <Check className="size-3 text-white" strokeWidth={3} />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || pending} onClick={submit}>
              Create space
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// The entry point: an overflow menu that opens the panel on a chosen tab.
// ---------------------------------------------------------------------------

export function SpaceSettingsMenu({
  ws,
  space,
  members,
  executives,
  candidates,
  projectCount,
  listCount,
  className,
  align = "end",
}: {
  ws: string;
  space: SpaceSettingsSpace;
  // Everyone with a department_members row, executives included.
  members: SpacePerson[];
  // Every executive in the workspace, whether or not they hold a row here.
  executives: SpacePerson[];
  // Active workspace members who could be added.
  candidates: SpacePerson[];
  projectCount: number;
  listCount: number;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("general");

  const openOn = (next: string) => {
    setTab(next);
    setOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Space actions for ${space.name}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className={cn(
              "rounded-[8px] p-1 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1",
              className
            )}
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-44">
          <DropdownMenuItem onSelect={() => openOn("general")}>
            <Settings strokeWidth={1.5} />
            Space settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openOn("members")}>
            <Users strokeWidth={1.5} />
            Manage members
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5">
              <SpaceGlyph
                name={space.name}
                icon={space.icon}
                color={space.accent_color}
                size={28}
              />
              {space.name}
            </SheetTitle>
            <SheetDescription>
              Who can see this space, and what it is called. Changes apply to
              everyone.
            </SheetDescription>
          </SheetHeader>

          <Tabs value={tab} onValueChange={setTab} className="px-4 pb-6">
            <TabsList className="w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="danger">Danger zone</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <GeneralTab ws={ws} space={space} />
            </TabsContent>
            <TabsContent value="members">
              <MembersTab
                ws={ws}
                space={space}
                members={members}
                executives={executives}
                candidates={candidates}
              />
            </TabsContent>
            <TabsContent value="danger">
              <DangerTab
                ws={ws}
                space={space}
                projectCount={projectCount}
                listCount={listCount}
                onDeleted={() => setOpen(false)}
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-meta font-medium text-text-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-label text-text-3">{hint}</span> : null}
    </label>
  );
}

function GeneralTab({ ws, space }: { ws: string; space: SpaceSettingsSpace }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState(space.name);
  const [slug, setSlug] = useState(space.slug);
  const [description, setDescription] = useState(space.description ?? "");
  const [icon, setIcon] = useState(space.icon ?? "");
  const [color, setColor] = useState(space.accent_color);
  const [pending, start] = useTransition();

  const dirty =
    name !== space.name ||
    slug !== space.slug ||
    description !== (space.description ?? "") ||
    icon !== (space.icon ?? "") ||
    color !== space.accent_color;

  const save = () =>
    start(async () => {
      const slugChanged = slug !== space.slug;
      const res = await updateDepartment(ws, space.id, {
        name,
        slug,
        description,
        icon,
        accent_color: color,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Space saved.");
      // The page we are standing on is addressed by the old slug, so it has
      // to be re-pointed or the next navigation 404s.
      if (slugChanged && pathname.includes(`/departments/${space.slug}`)) {
        router.replace(pathname.replace(`/departments/${space.slug}`, `/departments/${slug}`));
      } else {
        router.refresh();
      }
    });

  const setDefault = () =>
    start(async () => {
      const res = await setDefaultDepartment(ws, space.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`${space.name} is now the default space.`);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center gap-3">
        <SpaceGlyph name={name || "?"} icon={icon || null} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-text-1">{name || "New space"}</div>
          <div className="text-label text-text-3">
            {icon ? "Pick another icon below, or clear it." : "No icon yet, so the first letter shows."}
          </div>
        </div>
        {icon ? (
          <Button variant="ghost" size="sm" onClick={() => setIcon("")}>
            Use letter
          </Button>
        ) : null}
      </div>

      {/* A grid of real icons, because the old control was a text box asking
          for an emoji and nobody ever typed one, which is why every space in
          the sidebar was a monogram. */}
      <Field label="Icon" hint="Or paste an emoji instead, if you would rather.">
        <div className="flex flex-wrap gap-1">
          {SPACE_ICON_NAMES.map((n) => {
            const Ico = SPACE_ICONS[n];
            const on = icon === n;
            return (
              <button
                key={n}
                type="button"
                aria-label={`Icon ${n}`}
                aria-pressed={on}
                onClick={() => setIcon(n)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-[9px] border transition-colors",
                  on
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border text-text-2 hover:border-border-strong hover:text-text-1"
                )}
              >
                <Ico className="size-4" strokeWidth={2} />
              </button>
            );
          })}
        </div>
        <input
          value={SPACE_ICONS[icon] ? "" : icon}
          maxLength={8}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="Emoji"
          aria-label="Space emoji"
          className={cn(inputClass, "mt-2 w-24 text-center text-h3")}
        />
      </Field>

      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Space name"
          className={inputClass}
        />
      </Field>

      <Field
        label="Address"
        hint={
          slug !== space.slug ? (
            <span className="flex items-start gap-1.5 text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
              Changing this breaks every existing link and bookmark to this
              space. Anyone following an old one gets a not found page.
            </span>
          ) : (
            <>This space lives at /{ws}/departments/{space.slug}</>
          )
        }
      >
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-label="Space address"
          className={cn(inputClass, "font-mono", slug !== space.slug && "border-warning")}
        />
      </Field>

      <Field label="Description" hint={`${description.length} of 280 characters.`}>
        <textarea
          value={description}
          maxLength={280}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Space description"
          placeholder="What this space is for."
          className={cn(inputClass, "h-auto resize-none py-2")}
        />
      </Field>

      <Field label="Colour">
        <div className="flex flex-wrap items-center gap-1.5">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className="flex size-7 items-center justify-center rounded-full"
              style={{ backgroundColor: `${c}2A` }}
            >
              <span
                className="flex size-4 items-center justify-center rounded-full"
                style={{ backgroundColor: c }}
              >
                {color === c ? (
                  <Check className="size-3 text-white" strokeWidth={3} />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5">
        <div>
          <div className="text-body font-medium text-text-1">Set as default space</div>
          <div className="text-label text-text-3">
            {space.is_default
              ? "New projects that name no space are filed here."
              : "New projects that name no space are filed into the default space."}
          </div>
        </div>
        {space.is_default ? (
          <span className="rounded-[6px] bg-brand-soft px-2 py-1 text-label font-medium text-brand">
            Default
          </span>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} onClick={setDefault}>
            <Star strokeWidth={1.5} />
            Make default
          </Button>
        )}
      </div>

      <div className="flex justify-end">
        <Button disabled={!dirty || pending} onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function MembersTab({
  ws,
  space,
  members,
  executives,
  candidates,
}: {
  ws: string;
  space: SpaceSettingsSpace;
  members: SpacePerson[];
  executives: SpacePerson[];
  candidates: SpacePerson[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<SpacePerson | null>(null);

  // Executives are listed separately and read only, so they are not part of
  // the removable set. They see every space through app_can_see_department's
  // first branch, with or without a row here.
  const execIds = useMemo(() => new Set(executives.map((e) => e.id)), [executives]);
  const staff = members.filter((m) => !execIds.has(m.id));
  const present = new Set(members.map((m) => m.id));
  const addable = candidates.filter((c) => !present.has(c.id) && !execIds.has(c.id));
  const matches = query.trim()
    ? addable.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : addable;

  const add = (person: SpacePerson) =>
    start(async () => {
      const res = await addDepartmentMember(ws, space.id, person.id);
      if (res.error) toast.error(res.error);
      else {
        setQuery("");
        toast.success(`${person.name} can now see ${space.name}.`);
        router.refresh();
      }
    });

  const remove = (person: SpacePerson) =>
    start(async () => {
      const res = await removeDepartmentMember(ws, space.id, person.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.remaining === 0
          ? `${person.name} removed. Only executives can see ${space.name} now.`
          : `${person.name} removed.`
      );
      router.refresh();
    });

  const askRemove = (person: SpacePerson) => {
    // The warning is worth showing on the default space too. The consequence
    // is identical there, and the default space is the one nobody expects to
    // go quiet.
    if (staff.length === 1) setConfirming(person);
    else remove(person);
  };

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-meta font-medium text-text-2">
            Members of this space
          </span>
          <span className="font-mono text-label text-text-3 tabular">
            {staff.length}
          </span>
        </div>
        {staff.length === 0 ? (
          <div className="flex items-start gap-2 rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2.5 text-meta text-text-1">
            <AlertTriangle className="mt-px size-4 shrink-0 text-warning" strokeWidth={1.5} />
            <span>
              Nobody works in this space. Its projects are invisible to
              everyone except executives.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-[10px] border border-border">
            {staff.map((m) => (
              <div key={m.id} className="group flex items-center gap-2.5 px-3 py-2">
                <PersonAvatar name={m.name} src={m.avatar_url} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-text-1">{m.name}</div>
                  <div className="text-label text-text-3">
                    {ARCHETYPE_LABELS[m.archetype]}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${m.name} from ${space.name}`}
                  disabled={pending}
                  onClick={() => askRemove(m)}
                  className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-meta font-medium text-text-2">
          Add someone
        </span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-3"
            strokeWidth={1.5}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search people to add to ${space.name}`}
            placeholder="Search by name"
            className={cn(inputClass, "pl-8")}
          />
        </div>
        {addable.length === 0 ? (
          <p className="mt-1.5 text-label text-text-3">
            Everyone in the workspace is already here.
          </p>
        ) : matches.length === 0 ? (
          <p className="mt-1.5 text-label text-text-3">Nobody matches that.</p>
        ) : (
          <div className="mt-1.5 max-h-48 divide-y divide-border overflow-y-auto rounded-[10px] border border-border">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => add(c)}
                aria-label={`Add ${c.name} to ${space.name}`}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <PersonAvatar name={c.name} src={c.avatar_url} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-text-1">{c.name}</div>
                  <div className="text-label text-text-3">
                    {ARCHETYPE_LABELS[c.archetype]}
                  </div>
                </div>
                <UserPlus className="size-4 text-text-3" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separated on purpose. These people are not members of this space and
          removing them here would not change anything, so the section says so
          rather than offering a control that does nothing. */}
      <div className="rounded-[10px] border border-dashed border-border px-3 py-2.5">
        <div className="mb-1.5 text-meta font-medium text-text-2">
          Executives, always included
        </div>
        <p className="mb-2 text-label text-text-3">
          Executives see every space in the workspace and cannot be removed
          from one here. Change this in Admin, People, by changing their role.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {executives.length === 0 ? (
            <span className="text-meta text-text-3">No executives.</span>
          ) : (
            executives.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2 text-meta text-text-2"
              >
                <PersonAvatar name={e.name} src={e.avatar_url} size={20} />
                {e.name}
              </span>
            ))
          )}
        </div>
      </div>

      <Dialog open={Boolean(confirming)} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove the last member of {space.name}?</DialogTitle>
            <DialogDescription>
              {confirming?.name} is the only person working in this space.
              Removing them makes its projects invisible to everyone except
              executives, including in search, on boards, and in reports. The
              projects are not deleted, and adding someone back brings them
              into view again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const person = confirming;
                setConfirming(null);
                if (person) remove(person);
              }}
            >
              Remove anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

function DangerTab({
  ws,
  space,
  projectCount,
  listCount,
  onDeleted,
}: {
  ws: string;
  space: SpaceSettingsSpace;
  projectCount: number;
  listCount: number;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const archived = Boolean(space.archived_at);

  const toggleArchive = () =>
    start(async () => {
      const res = await setDepartmentArchived(ws, space.id, !archived);
      if (res.error) toast.error(res.error);
      else {
        toast.success(archived ? "Space restored." : "Space archived.");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="rounded-[10px] border border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-body font-medium text-text-1">
              {archived ? "Restore space" : "Archive space"}
            </div>
            <div className="mt-0.5 text-label text-text-3">
              {archived
                ? "Put it back in the sidebar and on the index."
                : "Takes it out of the sidebar and the index. Nothing is deleted, nobody loses access, and the page still opens from a direct link."}
            </div>
          </div>
          {space.is_default && !archived ? (
            <Button variant="outline" size="sm" disabled title="This is the default space.">
              <Archive strokeWidth={1.5} />
              Archive
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={pending} onClick={toggleArchive}>
              {archived ? (
                <ArchiveRestore strokeWidth={1.5} />
              ) : (
                <Archive strokeWidth={1.5} />
              )}
              {archived ? "Restore" : "Archive"}
            </Button>
          )}
        </div>
        {space.is_default && !archived ? (
          <p className="mt-2 text-label text-warning">
            This is the default space, so it cannot be archived. Make another
            space the default first, on the General tab.
          </p>
        ) : null}
      </div>

      <DeleteSpaceCard
        ws={ws}
        space={space}
        projectCount={projectCount}
        listCount={listCount}
        pending={pending}
        onDeleted={onDeleted}
      />
    </div>
  );
}

// Delete, behind the space's own name typed out. The action checks the name
// again, so this is a speed bump for people and not the only thing standing
// between a stray click and a deleted space.
export function DeleteSpaceCard({
  ws,
  space,
  projectCount,
  listCount,
  pending,
  onDeleted,
}: {
  ws: string;
  space: SpaceSettingsSpace;
  projectCount: number;
  listCount: number;
  pending?: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const matches = typed.trim() === space.name;

  const run = () =>
    start(async () => {
      const res = await deleteDepartment(ws, space.id, typed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${space.name} deleted.`);
      onDeleted();
      router.push(`/${ws}/departments`);
      router.refresh();
    });

  return (
    <div className="rounded-[10px] border border-danger/40 px-3 py-2.5">
      <div className="text-body font-medium text-danger">Delete space</div>
      {space.is_default ? (
        <>
          <p className="mt-0.5 text-label text-text-3">
            The default space cannot be deleted, because new projects that name
            no space are filed into it.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled
            className="mt-2"
            title="This is the default space."
          >
            <Trash2 strokeWidth={1.5} />
            Delete space
          </Button>
          <p className="mt-2 text-label text-warning">
            Make another space the default first, on the General tab.
          </p>
        </>
      ) : (
        <>
          <p className="mt-0.5 text-meta text-text-2">
            {projectCount === 0
              ? "No projects are filed here."
              : `${projectCount} project${projectCount === 1 ? "" : "s"} ${
                  projectCount === 1 ? "is" : "are"
                } filed here. ${
                  projectCount === 1 ? "It is" : "They are"
                } not deleted: ${
                  projectCount === 1 ? "it loses" : "they lose"
                } this space and keep every task, comment, and file.`}
            {listCount > 0
              ? ` The ${listCount} list${listCount === 1 ? "" : "s"} in this space ${
                  listCount === 1 ? "is" : "are"
                } deleted, because a list belongs to one space and has nowhere to go.`
              : ""}
          </p>
          <p className="mt-2 text-label text-text-3">
            Type <span className="font-medium text-text-1">{space.name}</span> to
            confirm.
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${space.name} to confirm deletion`}
              placeholder={space.name}
              className={cn(inputClass, "flex-1")}
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={!matches || busy || pending}
              onClick={run}
            >
              <Trash2 strokeWidth={1.5} />
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
