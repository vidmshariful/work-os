import Link from "next/link";
import { ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-chip-gray px-1.5 font-mono text-label font-semibold text-text-2 tabular",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-meta">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="size-3.5 text-text-3" /> : null}
          {item.href ? (
            <Link
              href={item.href}
              className="font-medium text-text-2 transition-colors hover:text-text-1"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-text-1">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Six-dot drag handle for reorderable tasks and templates.
export function DragHandle({ className }: { className?: string }) {
  return (
    <GripVertical
      className={cn(
        "size-4 cursor-grab text-text-3 opacity-0 transition-opacity group-hover:opacity-100",
        className
      )}
    />
  );
}

// Monospace entity code, the identity language of work below the wall.
export function CodeLabel({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-meta font-medium text-text-2 tabular",
        className
      )}
    >
      {code}
    </span>
  );
}
