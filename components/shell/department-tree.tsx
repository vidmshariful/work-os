"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, Folder, FolderOpen, List } from "lucide-react";
import { isTagTone, toneTextClass } from "@/components/primitives/tag";
import { SpaceGlyph } from "@/components/features/departments/space-glyph";
import { cn } from "@/lib/utils";

export interface DeptTreeItem {
  id: string;
  name: string;
  slug: string;
  accent_color: string;
  // The emoji, or null for the letter avatar built from the name. Same
  // glyph the spaces index and the space header draw.
  icon: string | null;
  // Folders in sort order, each with its own lists. A space with no folders
  // has an empty array here and renders exactly as it did before.
  folders: {
    id: string;
    name: string;
    // A TagTone key, or null. Tints the folder icon so a colour set in the
    // space page is visible here too.
    color: string | null;
    lists: { id: string; name: string }[];
  }[];
  // Lists sitting directly in the space, below the folders.
  lists: { id: string; name: string }[];
}

// The Work-section department tree: a "Departments" header linking to the
// index, then each visible department, expandable to its lists. Only the
// departments the viewer belongs to arrive here, so nothing leaks.
export function DepartmentTree({
  ws,
  departments,
}: {
  ws: string;
  departments: DeptTreeItem[];
}) {
  const pathname = usePathname();
  const indexHref = `/${ws}/departments`;
  const indexActive = pathname === indexHref;

  return (
    <div>
      <Link
        href={indexHref}
        aria-current={indexActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-body font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
          indexActive
            ? "bg-nav-active text-text-1"
            : "text-text-2 hover:bg-surface-2 hover:text-text-1"
        )}
      >
        <span className="[&>svg]:size-[18px] [&>svg]:stroke-[1.5]">
          <Building2 />
        </span>
        <span className="truncate">Spaces</span>
      </Link>

      {departments.length > 0 ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {departments.map((d) => (
            <DeptRow key={d.id} ws={ws} dept={d} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DeptRow({
  ws,
  dept,
  pathname,
}: {
  ws: string;
  dept: DeptTreeItem;
  pathname: string;
}) {
  const deptHref = `/${ws}/departments/${dept.slug}`;
  const active = pathname === deptHref;
  // True anywhere under this space, including a list page, which is exactly
  // the case the old check missed.
  const holdsRoute = pathname.startsWith(`${deptHref}/`) || active;
  const hasLists = dept.lists.length > 0 || dept.folders.length > 0;

  // Null means "nobody has clicked, follow the route". Once someone toggles
  // it the choice is theirs until they navigate into a different space.
  const [manual, setManual] = useState<boolean | null>(null);
  const lastRoute = useRef(holdsRoute);
  useEffect(() => {
    // Arriving somewhere under this space overrides a stale manual collapse,
    // so the tree always points at where you are after a navigation.
    if (holdsRoute && !lastRoute.current) setManual(null);
    lastRoute.current = holdsRoute;
  }, [holdsRoute]);
  const open = manual ?? holdsRoute;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-[9px] pr-2 transition-colors",
          active ? "bg-nav-active" : "hover:bg-surface-2"
        )}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => hasLists && setManual(!open)}
          className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-text-3 hover:text-text-1"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-90",
              !hasLists && "opacity-25"
            )}
            strokeWidth={2}
          />
        </button>
        <Link
          href={deptHref}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 py-[6px] text-body font-medium outline-none",
            active ? "text-text-1" : "text-text-2 group-hover:text-text-1"
          )}
        >
          <TreePending>
            <SpaceGlyph
              name={dept.name}
              icon={dept.icon}
              color={dept.accent_color}
              size={20}
              fontScale={0.55}
              className="rounded-[6px]"
            />
            <span className="truncate">{dept.name}</span>
          </TreePending>
        </Link>
      </div>

      {open && hasLists ? (
        <div className="ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {dept.folders.map((f) => (
            <FolderRow key={f.id} base={deptHref} folder={f} pathname={pathname} />
          ))}
          {dept.lists.map((l) => (
            <ListLink key={l.id} href={`${deptHref}/lists/${l.id}`} name={l.name} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Dim while the navigation is in flight. The space and list pages cannot
// show a skeleton (see page-skeleton.tsx), so the clicked name answering
// immediately is their loading state.
function TreePending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 transition-opacity",
        pending && "animate-pulse opacity-60"
      )}
    >
      {children}
    </span>
  );
}

// The third level. Folders have no page of their own, so this is a disclosure
// and not a link: clicking the name opens it rather than navigating nowhere.
function FolderRow({
  base,
  folder,
  pathname,
}: {
  base: string;
  folder: {
    id: string;
    name: string;
    color: string | null;
    lists: { id: string; name: string }[];
  };
  pathname: string;
}) {
  const holdsCurrent = folder.lists.some(
    (l) => pathname === `${base}/lists/${l.id}`
  );
  // The folder's own colour, when it has one. Set on the space page and
  // until now invisible in the tree.
  const folderTint =
    folder.color && isTagTone(folder.color)
      ? toneTextClass(folder.color)
      : "text-text-3";
  const [manual, setManual] = useState<boolean | null>(null);
  const lastHeld = useRef(holdsCurrent);
  useEffect(() => {
    if (holdsCurrent && !lastHeld.current) setManual(null);
    lastHeld.current = holdsCurrent;
  }, [holdsCurrent]);
  const open = manual ?? holdsCurrent;

  return (
    <div>
      <button
        type="button"
        onClick={() => setManual(!open)}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-1.5 rounded-[8px] px-1 text-meta text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          strokeWidth={2}
        />
        {open ? (
          <FolderOpen className={cn("size-3.5 shrink-0", folderTint)} strokeWidth={1.5} />
        ) : (
          <Folder className={cn("size-3.5 shrink-0", folderTint)} strokeWidth={1.5} />
        )}
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto font-mono text-micro text-text-3 tabular">
          {folder.lists.length}
        </span>
      </button>
      {open && folder.lists.length > 0 ? (
        <div className="ml-[14px] flex flex-col gap-0.5 border-l border-border pl-2">
          {folder.lists.map((l) => (
            <ListLink key={l.id} href={`${base}/lists/${l.id}`} name={l.name} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListLink({
  href,
  name,
  pathname,
}: {
  href: string;
  name: string;
  pathname: string;
}) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-meta transition-colors",
        active
          ? "bg-nav-active font-medium text-text-1"
          : "text-text-2 hover:bg-surface-2 hover:text-text-1"
      )}
    >
      <TreePending>
        <List
          className={cn("size-3.5 shrink-0", active ? "text-brand" : "text-text-3")}
          strokeWidth={1.5}
        />
        <span className="truncate">{name}</span>
      </TreePending>
    </Link>
  );
}
