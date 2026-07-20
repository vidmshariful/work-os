"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeptTreeItem {
  id: string;
  name: string;
  slug: string;
  accent_color: string;
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
  const hasLists = dept.lists.length > 0;

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
          {dept.lists.map((l) => {
            const href = `${deptHref}/lists/${l.id}`;
            const listActive = pathname === href;
            return (
              <Link
                key={l.id}
                href={href}
                className={cn(
                  "truncate rounded-[8px] px-2 py-[5px] text-[12.5px] transition-colors",
                  listActive
                    ? "bg-nav-active font-medium text-text-1"
                    : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                )}
              >
                {l.name}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
