import { cn } from "@/lib/utils";

// Right-rail panel for secondary context on detail screens: assigned people,
// activity, notifications, files.
export function RightRailPanel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-border bg-surface shadow-[var(--shadow-card)]",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h4 className="text-body font-semibold text-text-1">{title}</h4>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}
