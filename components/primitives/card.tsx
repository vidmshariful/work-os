import { cn } from "@/lib/utils";

// The base container: white surface, hairline border, a shadow you would have
// to look for. The border carries the edge now, so a card sitting on a card
// does not read as two stacked sheets.
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-surface shadow-[var(--shadow-card)]",
        className
      )}
    >
      {children}
    </div>
  );
}

// A panel inside a card. Same shape, no border and no shadow, because the
// card it sits in has already drawn the edge. Announcements and rail groups
// used a full Card here, which is what made those screens look quilted.
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[10px] bg-surface-2 p-3.5", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  // A card whose body is a list of rows wants a line under its header, or the
  // heading floats over the first row and reads as part of it.
  divider = false,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 pt-4 pb-3",
        divider && "border-b border-border pb-3",
        className
      )}
    >
      <h3 className="text-lead font-semibold text-text-1">{title}</h3>
      {action ? (
        <div className="flex shrink-0 items-center gap-2 text-meta text-text-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}
