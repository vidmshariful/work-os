import { cn } from "@/lib/utils";

// Simple data table with row hover and tabular numerals. KPI and history.
export function DataTable({
  columns,
  rows,
  className,
}: {
  columns: { key: string; label: string; align?: "left" | "right"; mono?: boolean }[];
  rows: Record<string, React.ReactNode>[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3",
                  c.align === "right" ? "text-right" : "text-left"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3 text-text-1",
                    c.align === "right" && "text-right",
                    c.mono && "font-mono text-[13px] tabular"
                  )}
                >
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
