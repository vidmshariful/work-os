import { cn } from "@/lib/utils";
import { Card } from "./card";

// Icon chip, big number, label. The number is the whole point of the card, so
// it is the largest thing on it by a clear step: four of these in a row used
// to read as four identical grey boxes because the figure and its caption sat
// only a size apart.
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
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-label font-semibold uppercase tracking-[0.07em] text-text-3">
            {label}
          </div>
          <div className="mt-1.5 font-mono text-h1 font-semibold leading-none text-text-1 tabular">
            {value}
          </div>
          {hint ? (
            <div className="mt-1.5 truncate text-meta text-text-3">{hint}</div>
          ) : null}
        </div>
        {icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[9px] [&>svg]:size-[17px]",
              tones[tone]
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
