import Link from "next/link";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/primitives/misc";

export interface ClientTab {
  key: string;
  label: string;
  count?: number;
}

// Tab strip on the client workroom. Server rendered, plain links.
export function ClientTabs({
  ws,
  clientId,
  tabs,
  active,
}: {
  ws: string;
  clientId: string;
  tabs: ClientTab[];
  active: string;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/${ws}/clients/${clientId}${t.key === "activity" ? "" : `?tab=${t.key}`}`}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
            active === t.key
              ? "border-brand text-text-1"
              : "border-transparent text-text-2 hover:text-text-1"
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 ? (
            <CountBadge count={t.count} className="ml-0" />
          ) : null}
        </Link>
      ))}
    </div>
  );
}
