import { Card } from "@/components/primitives/card";
import { ProgressRing } from "@/components/primitives/progress";
import { asNum, DASH } from "./kpi";
import { fmtPercent } from "@/lib/format";

// StatCard variant for rates: a progress ring where the icon chip would be.
export function RateCard({
  value,
  label,
  hint,
}: {
  value: number | string | null | undefined;
  label: string;
  hint?: string;
}) {
  const rate = asNum(value);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3.5">
        <ProgressRing value={rate ?? 0} size={36} showLabel={false} />
        <div className="min-w-0">
          <div className="font-mono text-[24px] font-semibold leading-tight text-text-1 tabular">
            {rate === null ? DASH : fmtPercent(rate)}
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
