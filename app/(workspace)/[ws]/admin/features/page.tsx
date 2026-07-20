import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { FeatureSwitchboard } from "@/components/features/admin/feature-switchboard";
import {
  FEATURE_LABELS,
  TOGGLEABLE_FEATURES,
} from "@/lib/data/workspace-settings";

export const metadata: Metadata = { title: "Features" };

const DESCRIPTIONS: Record<string, string> = {
  departments: "Spaces, lists, and the sidebar tree.",
  clients: "The client list and client workroom.",
  projects: "The projects list and board.",
  database: "Tables and docs.",
  team: "The directory and org chart.",
  hr: "Leave requests and balances.",
  performance: "KPI dashboards.",
  calendar: "The studio and personal calendar.",
  todos: "The personal to-do board.",
};

export default async function AdminFeaturesPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);

  const catalogue = TOGGLEABLE_FEATURES.map((key) => ({
    key,
    label: FEATURE_LABELS[key],
    description: DESCRIPTIONS[key] ?? "",
  }));

  return (
    <Card>
      <CardHeader title="Features" />
      <CardBody>
        <p className="pb-2 text-[12.5px] text-text-2">
          Turn a feature off and it leaves the sidebar for everyone. Set a
          minimum role to keep it, but narrow who sees it. Dashboard, my tasks,
          and settings stay on so an admin can always get back here.
        </p>
        <FeatureSwitchboard
          ws={ws}
          features={ctx.features}
          catalogue={catalogue}
        />
      </CardBody>
    </Card>
  );
}
