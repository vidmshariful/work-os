import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Breadcrumbs } from "@/components/primitives/misc";
import { NewEventForm } from "@/components/features/calendar/new-event-form";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canCreateEvents) redirect(`/${ws}/calendar`);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Calendar", href: `/${ws}/calendar` },
          { label: "New event" },
        ]}
      />
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">
          New event
        </h1>
        <p className="mt-1 text-sm text-text-2">
          Only for genuinely new things, like a shoot day. Deadlines and leave arrive on their own.
        </p>
      </div>
      <Card>
        <CardHeader title="Event details" />
        <CardBody>
          <NewEventForm ws={ws} />
        </CardBody>
      </Card>
    </div>
  );
}
