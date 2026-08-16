import { cn } from "@/lib/utils";

// A quiet icon, one line of direction, and a primary action. An empty screen
// is an invitation to act, never a dead end.
//
// The default used to be tall enough to leave a hand's width of nothing in
// the middle of the dashboard. A card that happens to be empty should not
// become the biggest thing on the page, so "compact" is the size for anything
// sitting inside a panel and the tall one is kept for a whole empty screen.
export function EmptyState({
  icon,
  title,
  action,
  size = "default",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  size?: "default" | "compact";
  className?: string;
}) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-5 py-7" : "gap-3 px-6 py-12",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-[11px] bg-chip-gray text-text-3",
          compact ? "size-8 [&>svg]:size-4" : "size-10 [&>svg]:size-5"
        )}
      >
        {icon}
      </span>
      <p className={cn("max-w-xs text-text-2", compact ? "text-meta" : "text-body")}>
        {title}
      </p>
      {action}
    </div>
  );
}
