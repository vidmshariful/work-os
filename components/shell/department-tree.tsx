"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeptTreeItem {
  id: string;
  name: string;
  slug: string;
  accent_color: string;
  // Folders in sort order, each with its own lists. A space with no folders
  // has an empty array here and renders exactly as it did before.
  folders: { id: string; name: string; lists: { id: string; name: string }[] }[];
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
          "flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
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
  const [open, setOpen] = useState(active);
  const hasLists = dept.lists.length > 0 || dept.folders.length > 0;

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
          onClick={() => hasLists && setOpen((o) => !o)}
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
            "flex min-w-0 flex-1 items-center gap-2 py-[6px] text-[13px] font-medium outline-none",
            active ? "text-text-1" : "text-text-2 group-hover:text-text-1"
          )}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dept.accent_color }}
          />
          <span className="truncate">{dept.name}</span>
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

// The third level. Folders have no page of their own, so this is a disclosure
// and not a link: clicking the name opens it rather than navigating nowhere.
function FolderRow({
  base,
  folder,
  pathname,
}: {
  base: string;
  folder: { id: string; name: string; lists: { id: string; name: string }[] };
  pathname: string;
}) {
  const holdsCurrent = folder.lists.some(
    (l) => pathname === `${base}/lists/${l.id}`
  );
  const [open, setOpen] = useState(holdsCurrent);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-[8px] px-1 py-[5px] text-[12.5px] text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          strokeWidth={2}
        />
        <Folder className="size-3.5 shrink-0 text-text-3" strokeWidth={1.5} />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto font-mono text-[10.5px] text-text-3 tabular">
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
      className={cn(
        "truncate rounded-[8px] px-2 py-[5px] text-[12.5px] transition-colors",
        active
          ? "bg-nav-active font-medium text-text-1"
          : "text-text-2 hover:bg-surface-2 hover:text-text-1"
      )}
    >
      {name}
    </Link>
  );
}
