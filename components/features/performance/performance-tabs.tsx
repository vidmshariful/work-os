import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PerformanceTab {
  key: string;
  label: string;
}

// Capability-gated tab row. Server rendered, each tab is a plain link.
export function PerformanceTabs({
  ws,
  tabs,
  active,
}: {
  ws: string;
  tabs: PerformanceTab[];
  active: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <div className="flex items-center gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/${ws}/performance?tab=${t.key}`}
          className={cn(
            "rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors",
            active === t.key
              ? "bg-brand-soft text-brand"
              : "text-text-2 hover:bg-surface-2 hover:text-text-1"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
