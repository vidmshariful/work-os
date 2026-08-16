import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/primitives/card";
import { PersonAvatar } from "@/components/primitives/avatar";
import { WALL_HELPER_COPY } from "@/components/features/admin/shared";
import {
  ActiveSwitch,
  AdminReportsToSelect,
  ArchetypeSelect,
  RoleSelect,
  WallSideSelect,
} from "@/components/features/admin/membership-controls";
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
  const options = rows
    .filter((r) => r.is_active)
    .map((r) => ({ id: r.profile_id, name: r.profile.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-text-2">{WALL_HELPER_COPY}</p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-body">
          <thead>
            <tr className="border-b border-border">
              {["Person", "Role", "Archetype", "Wall side", "Reports to", "Active"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-meta font-semibold uppercase tracking-[0.06em] text-text-3"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td className="w-[170px] px-4 py-2.5">
                  <RoleSelect ws={ws} membershipId={r.id} value={r.role} />
                </td>
                <td className="w-[150px] px-4 py-2.5">
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
