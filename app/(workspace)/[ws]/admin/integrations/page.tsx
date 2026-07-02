import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Tag } from "@/components/primitives/tag";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Integrations" };

const INTEGRATIONS = [
  {
    name: "HighLevel",
    body: "Deals originate in HighLevel. Work OS begins at deal closed: when a client is created here, the handoff scaffolds the project and notifies the team.",
    href: "https://app.gohighlevel.com",
    action: "Open HighLevel",
  },
  {
    name: "Discord",
    body: "Team communication stays in Discord. Work OS holds the work itself: tasks, revisions, and decisions that need a paper trail.",
    href: "https://discord.com/app",
    action: "Open Discord",
  },
];

export default function AdminIntegrationsPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {INTEGRATIONS.map((item) => (
        <Card key={item.name}>
          <CardHeader title={item.name} action={<Tag tone="gray">Linked externally</Tag>} />
          <CardBody>
            <p className="text-sm leading-relaxed text-text-2">{item.body}</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href={item.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {item.action}
              </a>
            </Button>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
