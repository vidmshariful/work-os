import { cn } from "@/lib/utils";

// Progress ring for project completion and KPI. value is 0 to 1.
export function ProgressRing({
  value,
  size = 36,
  strokeWidth = 3.5,
  showLabel = true,
  className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--chip-gray)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      {showLabel ? (
        <span className="absolute font-mono text-micro font-semibold text-text-2 tabular">
          {Math.round(clamped * 100)}
        </span>
      ) : null}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const tones = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-chip-gray", className)}>
      <div
        className={cn("h-full rounded-full transition-[width]", tones[tone])}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
