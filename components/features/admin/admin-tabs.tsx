"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "people", label: "People" },
  { key: "departments", label: "Spaces" },
  { key: "templates", label: "Templates" },
  { key: "integrations", label: "Integrations" },
  { key: "workspace", label: "Workspace" },
];

export function AdminTabs({ ws }: { ws: string }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-border pb-2">
      {TABS.map((t) => {
        const href = `/${ws}/admin/${t.key}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-nav-active text-text-1"
                : "text-text-2 hover:bg-surface-2 hover:text-text-1"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
