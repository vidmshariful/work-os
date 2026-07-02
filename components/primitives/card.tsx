import { cn } from "@/lib/utils";

// The base container. White surface, hairline border, very soft shadow.
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

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 pt-5 pb-3",
        className
      )}
    >
      <h3 className="text-[15px] font-semibold text-text-1">{title}</h3>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
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
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
