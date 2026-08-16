import { cn } from "@/lib/utils";

// One row in a list: leading marks, a title, metadata columns, and actions
// that appear on hover. The whole app is made of these, so the density set
// here is the density of the product.
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
        dense ? "gap-3 px-4 py-1.5" : "gap-4 px-4 py-3",
        className
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-text-1",
            // A dense row is a table row: its title is body weight, and the
            // columns beside it carry the emphasis. A roomy row is a card in
            // disguise, so its title leads.
            dense ? "text-body font-medium" : "text-body font-medium"
          )}
        >
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-meta text-text-2">{subtitle}</div>
        ) : null}
      </div>
      {meta ? (
        <div className={cn("flex shrink-0 items-center", dense ? "gap-3" : "gap-4")}>
          {meta}
        </div>
      ) : null}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
