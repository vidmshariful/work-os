import Link from "next/link";
import { List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

// Small segmented control switching the projects screen between the list and
// board views. Pure links, so it stays a server component and preserves the
// active filters.
export function ViewToggle({
  ws,
  view,
  status,
  owner,
}: {
  ws: string;
  view: "list" | "board";
  status: string;
  owner: string;
}) {
  const href = (v: "list" | "board") => {
    const params = new URLSearchParams();
    if (v !== "list") params.set("view", v);
    if (status) params.set("status", status);
    if (owner) params.set("owner", owner);
    const qs = params.toString();
    return `/${ws}/projects${qs ? `?${qs}` : ""}`;
  };

  const item = (v: "list" | "board", label: string, icon: React.ReactNode) => (
    <Link
      href={href(v)}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-meta font-medium transition-colors",
        view === v
          ? "bg-nav-active text-text-1"
          : "text-text-2 hover:text-text-1"
      )}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {label}
    </Link>
  );

  return (
    <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
      {item("list", "List", <List />)}
      {item("board", "Board", <LayoutGrid />)}
    </div>
  );
}
