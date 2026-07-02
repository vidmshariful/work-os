import { cn } from "@/lib/utils";

// Title plus subtitle, meta columns, a tag, a trailing action and overflow.
// Projects, tasks, history.
export function ListRow({
  title,
  subtitle,
  leading,
  meta,
  trailing,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2",
        className
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-1">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[12.5px] text-text-2">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="flex shrink-0 items-center gap-4">{meta}</div>
      ) : null}
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>
      ) : null}
    </div>
  );
}
