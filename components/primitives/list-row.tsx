import { cn } from "@/lib/utils";

// Title plus subtitle, meta columns, a tag, a trailing action and overflow.
// Projects, tasks, history.
//
// dense is one line and half the height, for a surface that is read as a
// table rather than a feed. A project list of fifteen rows at the roomy
// height fills a screen with six of them, which is not a list anyone can
// scan. Everything else keeps the original rhythm.
export function ListRow({
  title,
  subtitle,
  leading,
  meta,
  trailing,
  dense = false,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  dense?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group flex items-center border-b border-border transition-colors last:border-b-0 hover:bg-surface-2",
        dense ? "gap-3 px-4 py-1.5" : "gap-4 px-5 py-3.5",
        className
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate font-medium text-text-1",
            dense ? "text-[13px]" : "text-sm"
          )}
        >
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[12.5px] text-text-2">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className={cn("flex shrink-0 items-center", dense ? "gap-3" : "gap-4")}>
          {meta}
        </div>
      ) : null}
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>
      ) : null}
    </div>
  );
}
