import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { WorkspaceForm } from "@/components/features/admin/workspace-form";

export const metadata: Metadata = { title: "Workspace" };

export default async function AdminWorkspacePage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);

  return (
    <Card>
      <CardHeader title="Workspace settings" />
      <CardBody>
        <WorkspaceForm
          ws={ws}
          name={ctx.workspace.name}
          accentColor={ctx.workspace.accent_color}
        />
      </CardBody>
    </Card>
  );
}
