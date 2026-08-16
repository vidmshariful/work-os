import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/types";

// The slim icon rail. One icon per workspace the user is a member of, and
// nothing else: no locked entries, no hints that other workspaces exist.
export function WorkspaceRail({
  workspaces,
  activeSlug,
}: {
  workspaces: Workspace[];
  activeSlug: string;
}) {
  return (
    <aside className="flex w-[52px] shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-3">
      {workspaces.map((ws) => {
        const active = ws.slug === activeSlug;
        return (
          <Link
            key={ws.id}
            href={`/${ws.slug}/home`}
            title={ws.name}
            className={cn(
              "flex size-9 items-center justify-center rounded-[10px] text-body font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-brand/40",
              active
                ? "ring-2 ring-offset-2 ring-offset-surface"
                : "opacity-75 hover:opacity-100"
            )}
            style={{
              backgroundColor: `${ws.accent_color}1A`,
              color: ws.accent_color,
              ...(active ? { ["--tw-ring-color" as string]: ws.accent_color } : {}),
            }}
          >
            {ws.name.slice(0, 1).toUpperCase()}
          </Link>
        );
      })}
    </aside>
  );
}
