import { cn } from "@/lib/utils";
import { Card } from "./card";

// Icon chip, big number, label. Dashboard and KPI headers.
export function StatCard({
  icon,
  value,
  label,
  hint,
  tone = "blue",
  className,
}: {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "blue" | "violet" | "green" | "amber" | "rose" | "teal" | "gray";
  className?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-tag-blue-soft text-tag-blue",
    violet: "bg-tag-violet-soft text-tag-violet",
    green: "bg-tag-green-soft text-tag-green",
    amber: "bg-tag-amber-soft text-tag-amber",
    rose: "bg-tag-rose-soft text-tag-rose",
    teal: "bg-tag-teal-soft text-tag-teal",
    gray: "bg-chip-gray text-text-2",
  };
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start gap-3.5">
        {icon ? (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[10px] [&>svg]:size-[18px]",
              tones[tone]
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="font-mono text-[24px] font-semibold leading-tight text-text-1 tabular">
            {value}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] font-medium text-text-2">
            {label}
          </div>
          {hint ? (
            <div className="mt-0.5 text-[12px] text-text-3">{hint}</div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
