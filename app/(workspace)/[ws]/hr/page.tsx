import type { Metadata } from "next";
import { Plane } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { LeaveStatusChip, Tag } from "@/components/primitives/tag";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ProgressBar } from "@/components/primitives/progress";
import { EmptyState } from "@/components/primitives/empty-state";
import { fmtDate } from "@/lib/format";
import {
  AllowanceEditor,
  ApprovalButtons,
  CancelLeaveButton,
  LeaveRequestForm,
} from "@/components/features/hr/leave-controls";
import type { LeaveBalance, LeaveRequest } from "@/lib/types";

export const metadata: Metadata = { title: "HR and Leave" };

type RequestWithPerson = LeaveRequest & {
  person: { id: string; full_name: string; avatar_url: string | null } | null;
};

const TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  unpaid: "Unpaid",
  other: "Other",
};

export default async function HrPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const isExec = ctx.membership.archetype === "executive";

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

  const [
    { data: balanceRow },
    { data: myRequests },
    { data: visibleRequests },
    { data: outRows },
    { data: memberRows },
    { data: balanceRows },
  ] = await Promise.all([
      supabase
        .from("leave_balances")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .eq("profile_id", ctx.userId)
        .eq("year", year)
        .maybeSingle(),
      supabase
        .from("leave_requests")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .eq("profile_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.capabilities.canApproveLeave
        ? supabase
            .from("leave_requests")
            .select("*, person:profiles!leave_requests_profile_id_fkey(id, full_name, avatar_url)")
            .eq("workspace_id", ctx.workspace.id)
            .eq("status", "pending")
            .neq("profile_id", ctx.userId)
            .order("created_at")
        : Promise.resolve({ data: [] }),
      // Who is away in the next two weeks. RLS trims this to what each
      // reader may know: their own leave, their reports' for a lead, all of
      // it for an executive. The card renders whatever comes back.
      supabase
        .from("leave_requests")
        .select(
          "id, start_date, end_date, type, person:profiles!leave_requests_profile_id_fkey(id, full_name, avatar_url)"
        )
        .eq("workspace_id", ctx.workspace.id)
        .eq("status", "approved")
        .lte("start_date", horizon)
        .gte("end_date", today)
        .order("start_date"),
      // The allowance editor, executives only.
      isExec
        ? supabase
            .from("memberships")
            .select("profile:profiles!profile_id!inner(id, full_name)")
            .eq("workspace_id", ctx.workspace.id)
            .eq("is_active", true)
        : Promise.resolve({ data: [] }),
      isExec
        ? supabase
            .from("leave_balances")
            .select("profile_id, total_days, used_days")
            .eq("workspace_id", ctx.workspace.id)
            .eq("year", year)
        : Promise.resolve({ data: [] }),
    ]);

  const balance = (balanceRow ?? null) as LeaveBalance | null;
  const mine = (myRequests ?? []) as LeaveRequest[];
  const pending = (visibleRequests ?? []) as unknown as RequestWithPerson[];

  // Leads see requests from their direct reports that still need endorsement.
  // Executives are the final gate: endorsed requests, plus requests from
  // people with no lead in between.
  const needsEndorsement = pending.filter((r) => !r.lead_approved_at);
  const finalGate = pending.filter((r) => r.lead_approved_at);
  const leadQueue = isExec ? [] : needsEndorsement;
  const execQueue = isExec ? [...finalGate, ...needsEndorsement] : [];

  const out = (outRows ?? []) as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    type: string;
    person: { id: string; full_name: string; avatar_url: string | null } | null;
  }[];

  const balanceByPerson = new Map(
    ((balanceRows ?? []) as { profile_id: string; total_days: number; used_days: number }[]).map(
      (b) => [b.profile_id, b]
    )
  );
  const allowancePeople = ((memberRows ?? []) as unknown as {
    profile: { id: string; full_name: string };
  }[])
    .filter((m) => m.profile)
    .map((m) => ({
      id: m.profile.id,
      full_name: m.profile.full_name,
      total: Number(balanceByPerson.get(m.profile.id)?.total_days ?? 20),
      used: Number(balanceByPerson.get(m.profile.id)?.used_days ?? 0),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const remaining = balance
    ? Number(balance.total_days) - Number(balance.used_days)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          HR and leave
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Requests route up your reporting line, the Operations Manager has the final say.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {ctx.capabilities.canApproveLeave && (leadQueue.length > 0 || execQueue.length > 0) ? (
            <Card>
              <CardHeader title="Waiting on you" />
              <div>
                {(isExec ? execQueue : leadQueue).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
                  >
                    <PersonAvatar
                      name={r.person?.full_name}
                      src={r.person?.avatar_url}
                      size={30}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-1">
                        {r.person?.full_name ?? "Teammate"}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-text-2">
                        <span className="font-mono tabular">
                          {fmtDate(r.start_date)} to {fmtDate(r.end_date)}
                        </span>
                        <span className="font-mono tabular">{r.days}d</span>
                        <Tag tone="gray">{TYPE_LABELS[r.type] ?? r.type}</Tag>
                        {r.lead_approved_at ? (
                          <span className="text-text-3">Endorsed by their lead</span>
                        ) : null}
                      </p>
                      {r.reason ? (
                        <p className="mt-0.5 text-[12.5px] text-text-3">{r.reason}</p>
                      ) : null}
                    </div>
                    <ApprovalButtons
                      ws={ws}
                      requestId={r.id}
                      mode={isExec ? "decide" : "endorse"}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="My requests" />
            {mine.length === 0 ? (
              <EmptyState
                icon={<Plane />}
                title="No leave requested yet. The form is right there."
              />
            ) : (
              mine.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-1">
                      <span className="font-mono text-[13px] tabular">
                        {fmtDate(r.start_date)} to {fmtDate(r.end_date)}
                      </span>
                      <span className="font-mono text-[12.5px] text-text-2 tabular">
                        {r.days}d
                      </span>
                      <Tag tone="gray">{TYPE_LABELS[r.type] ?? r.type}</Tag>
                    </p>
                    {r.reason ? (
                      <p className="mt-0.5 text-[12.5px] text-text-3">{r.reason}</p>
                    ) : null}
                    {r.status === "pending" && r.lead_approved_at ? (
                      <p className="mt-0.5 text-[12px] text-text-3">
                        Endorsed, waiting on the final gate.
                      </p>
                    ) : null}
                    {r.status === "rejected" && r.decision_note ? (
                      <p className="mt-0.5 text-[12.5px] text-danger">
                        {r.decision_note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <LeaveStatusChip status={r.status} />
                    {r.status === "pending" ? (
                      <CancelLeaveButton ws={ws} requestId={r.id} />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={`Balance, ${year}`} />
            <CardBody>
              {balance ? (
                <>
                  <div className="flex items-end justify-between">
                    <span className="font-mono text-[28px] font-semibold text-text-1 tabular">
                      {remaining}
                    </span>
                    <span className="pb-1 text-[12.5px] text-text-2">
                      of {Number(balance.total_days)} days left
                    </span>
                  </div>
                  <ProgressBar
                    value={
                      Number(balance.total_days) > 0
                        ? Number(balance.used_days) / Number(balance.total_days)
                        : 0
                    }
                    className="mt-2"
                  />
                  <p className="mt-2 text-[12px] text-text-3">
                    {Number(balance.used_days)} used. Approved leave lands on the calendar automatically.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-text-3">
                  No balance set for this year yet. An executive can add one in Admin.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Request leave" />
            <CardBody>
              <LeaveRequestForm ws={ws} />
            </CardBody>
          </Card>

          {out.length > 0 ? (
            <Card>
              <CardHeader title="Out in the next two weeks" />
              <div>
                {out.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-2.5 border-b border-border px-5 py-2.5 last:border-b-0"
                  >
                    <PersonAvatar
                      name={o.person?.full_name}
                      src={o.person?.avatar_url}
                      size={24}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-1">
                      {o.person?.full_name ?? "Teammate"}
                    </span>
                    <span className="font-mono text-[12px] text-text-2 tabular">
                      {fmtDate(o.start_date)} to {fmtDate(o.end_date)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {isExec ? (
            <Card>
              <CardHeader
                title={`Allowances, ${year}`}
                action={
                  <span className="text-[11.5px] text-text-3">days per year</span>
                }
              />
              <AllowanceEditor ws={ws} year={year} people={allowancePeople} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
