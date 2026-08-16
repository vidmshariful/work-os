import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { GeneralSettingsForm } from "@/components/features/admin/general-settings-form";
import { WorkspaceForm } from "@/components/features/admin/workspace-form";

export const metadata: Metadata = { title: "General" };

export default async function AdminGeneralPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Workspace settings" />
        <CardBody>
          <p className="pb-2 text-meta text-text-2">
            Set once here. Every member reads these, so a change applies to
            everyone on their next screen.
          </p>
          <GeneralSettingsForm
            ws={ws}
            settings={ctx.settings}
            workspaceName={ctx.workspace.name}
          />
        </CardBody>
      </Card>

      {/* Name and accent live on the workspaces row, which is their one home.
          The same form as before, folded in here so workspace identity is
          edited in one place rather than two. */}
      <Card>
        <CardHeader title="Identity" />
        <CardBody>
          <p className="pb-3 text-meta text-text-2">
            The name and accent shown in the workspace rail.
          </p>
          <WorkspaceForm
            ws={ws}
            name={ctx.workspace.name}
            accentColor={ctx.workspace.accent_color}
          />
        </CardBody>
      </Card>
    </div>
  );
}
