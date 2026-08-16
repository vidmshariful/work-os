import { DataTable } from "@/components/primitives/data-table";
import { PersonAvatar } from "@/components/primitives/avatar";
import {
  asNum,
  byName,
  numOrDash,
  pctOrDash,
  type KpiMember,
  type KpiPersonRow,
} from "./kpi";

const COLUMNS: {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
}[] = [
  { key: "person", label: "Person" },
  { key: "completed", label: "Completed", align: "right", mono: true },
  { key: "d30", label: "30d", align: "right", mono: true },
  { key: "onTime", label: "On-time", align: "right", mono: true },
  { key: "cycle", label: "Cycle days", align: "right", mono: true },
  { key: "revision", label: "Revision rate", align: "right", mono: true },
];

// Per-person KPI table. People without any assigned work yet show zeros
// for counts and a dash for rates that do not exist.
export function PersonKpiTable({
  people,
  kpiByProfile,
}: {
  people: KpiMember[];
  kpiByProfile: Map<string, KpiPersonRow>;
}) {
  const rows = [...people].sort(byName).map((p) => {
    const kpi = kpiByProfile.get(p.profile_id);
    const name = p.profile?.full_name ?? "Unknown";
    return {
      person: (
        <span className="flex items-center gap-2.5">
          <PersonAvatar name={name} src={p.profile?.avatar_url} size={26} />
          <span className="truncate text-body font-medium text-text-1">
            {name}
          </span>
        </span>
      ),
      completed: asNum(kpi?.tasks_completed) ?? 0,
      d30: asNum(kpi?.completed_30d) ?? 0,
      onTime: pctOrDash(kpi?.on_time_rate),
      cycle: numOrDash(kpi?.avg_cycle_days),
      revision: numOrDash(kpi?.revision_rate),
    };
  });

  return <DataTable columns={COLUMNS} rows={rows} />;
}
