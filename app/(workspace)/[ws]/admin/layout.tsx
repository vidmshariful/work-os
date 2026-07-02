import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data/context";
import { AdminTabs } from "@/components/features/admin/admin-tabs";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) redirect(`/${ws}/home`);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          Settings
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Roles, the wall line, templates, and workspace configuration.
        </p>
      </div>
      <AdminTabs ws={ws} />
      {children}
    </div>
  );
}
