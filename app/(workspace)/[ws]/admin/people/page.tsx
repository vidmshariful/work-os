import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Tag } from "@/components/primitives/tag";
import { TimeAgo } from "@/components/primitives/local-time";
import { WALL_HELPER_COPY } from "@/components/features/admin/shared";
import {
  ActiveSwitch,
  AdminReportsToSelect,
  ArchetypeSelect,
  RoleSelect,
  WallSideSelect,
} from "@/components/features/admin/membership-controls";
import {
  InviteDialog,
  PersonRowActions,
} from "@/components/features/admin/people-controls";
import { STATUS_META, type MemberStatus } from "@/components/features/team/labels";
import type { Membership, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "People" };

type Row = Membership & { profile: Profile };

export default async function AdminPeoplePage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const { data } = await supabase
    .from("memberships")
    .select("*, profile:profiles!profile_id(*)")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at");
  const rows = (data ?? []) as unknown as Row[];

  // Whether an invitation was accepted is auth's fact, not ours, so it is read
  // rather than stored: a copy here could disagree with the truth. This page
  // is executive only and a studio is a small number of people, so one call
  // covers the whole list.
  const signedIn = new Set<string>();
  if (ctx.membership.archetype === "executive") {
    const admin = createAdminClient();
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of users?.users ?? []) {
      if (u.last_sign_in_at) signedIn.add(u.id);
    }
  }
  const statusOf = (r: Row): MemberStatus =>
    !r.is_active ? "deactivated" : signedIn.has(r.profile_id) ? "active" : "invited";

  const options = rows
    .filter((r) => r.is_active)
    .map((r) => ({ id: r.profile_id, name: r.profile.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts = rows.reduce(
    (acc, r) => {
      acc[statusOf(r)] += 1;
      return acc;
    },
    { active: 0, invited: 0, deactivated: 0 } as Record<MemberStatus, number>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-text-2">
          <span className="font-mono tabular">{counts.active}</span> active
          {counts.invited > 0 ? (
            <>
              {", "}
              <span className="font-mono tabular">{counts.invited}</span> invited
            </>
          ) : null}
          {counts.deactivated > 0 ? (
            <>
              {", "}
              <span className="font-mono tabular">{counts.deactivated}</span> deactivated
            </>
          ) : null}
        </p>
        <InviteDialog
          ws={ws}
          members={options.map((o) => ({ id: o.id, full_name: o.name }))}
        />
      </div>
      <p className="text-meta text-text-2">{WALL_HELPER_COPY}</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-body">
          <thead>
            <tr className="border-b border-border">
              {["Person", "Status", "Job title", "Access level", "Client names", "Reports to", "Active", ""].map(
                (h, i) => (
                  <th key={h || i} className="col-label px-4 py-2.5 text-left">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = statusOf(r);
              return (
                <tr
                  key={r.id}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <PersonAvatar
                        name={r.profile.full_name}
                        src={r.profile.avatar_url}
                        size={28}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text-1">
                          {r.profile.full_name}
                        </span>
                        <span className="block truncate text-label text-text-3">
                          {r.profile.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="w-[150px] px-4 py-2.5">
                    <Tag tone={STATUS_META[status].tone} dot>
                      {STATUS_META[status].label}
                    </Tag>
                    {status === "invited" && r.invited_at ? (
                      <span className="mt-0.5 block text-label text-text-3">
                        sent <TimeAgo at={r.invited_at} />
                      </span>
                    ) : null}
                  </td>
                  <td className="w-[170px] px-4 py-2.5">
                    <RoleSelect ws={ws} membershipId={r.id} value={r.role} />
                  </td>
                  <td className="w-[190px] px-4 py-2.5">
                    <ArchetypeSelect ws={ws} membershipId={r.id} value={r.archetype} />
                  </td>
                  <td className="w-[110px] px-4 py-2.5">
                    <WallSideSelect ws={ws} membershipId={r.id} value={r.wall_side} />
                  </td>
                  <td className="w-[160px] px-4 py-2.5">
                    <AdminReportsToSelect
                      ws={ws}
                      membershipId={r.id}
                      value={r.reports_to}
                      options={options.filter((o) => o.id !== r.profile_id)}
                    />
                  </td>
                  <td className="w-[70px] px-4 py-2.5">
                    <ActiveSwitch
                      ws={ws}
                      membershipId={r.id}
                      value={r.is_active}
                      isSelf={r.profile_id === ctx.userId}
                    />
                  </td>
                  <td className="w-[60px] px-4 py-2.5 text-right">
                    <PersonRowActions
                      ws={ws}
                      profileId={r.profile_id}
                      name={r.profile.full_name}
                      status={status}
                      isSelf={r.profile_id === ctx.userId}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
