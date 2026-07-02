import { cn } from "@/lib/utils";

// A quiet icon, one line of direction, and a primary action. An empty screen
// is an invitation to act, never a dead end.
export function EmptyState({
  icon,
  title,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-chip-gray text-text-3 [&>svg]:size-5">
        {icon}
      </span>
      <p className="max-w-xs text-sm text-text-2">{title}</p>
      {action}
    </div>
  );
}
