import { ExternalLink } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/primitives/card";
import { ORIGIN_LABELS } from "@/lib/wall";
import { fmtDateFull, fmtMoney, fmtPercent } from "@/lib/format";
import type { VClient } from "@/lib/types";

function IdentityRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-meta text-text-2">{label}</span>
      <span className="min-w-0 text-right text-body font-medium text-text-1">
        {children}
      </span>
    </div>
  );
}

export interface ClientHealth {
  delivered: number;
  onTimeRate: number | null;
  revisionRate: number | null;
}

// Commercial identity and computed account health, above the wall only.
// Below the wall this card does not render at all.
export function ClientIdentityCard({
  client,
  health,
}: {
  client: VClient;
  health: ClientHealth;
}) {
  return (
    <Card className="self-start">
      <CardHeader title="Account" />
      <CardBody>
        <IdentityRow label="Origin">
          {client.origin ? ORIGIN_LABELS[client.origin] ?? client.origin : "Direct"}
        </IdentityRow>
        <IdentityRow label="Total value">
          <span className="font-mono tabular">
            {client.contract_value !== null ? (
              fmtMoney(client.contract_value)
            ) : (
              <span className="font-sans font-normal text-text-3">Not set</span>
            )}
          </span>
        </IdentityRow>
        <IdentityRow label="Website">
          {client.website ? (
            <a
              href={client.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-brand hover:underline"
            >
              {client.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="font-normal text-text-3">Not set</span>
          )}
        </IdentityRow>
        <IdentityRow label="HighLevel">
          {client.highlevel_url ? (
            <a
              href={client.highlevel_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              Open record
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="font-normal text-text-3">Not linked</span>
          )}
        </IdentityRow>
        <IdentityRow label="Client since">
          <span className="font-mono tabular">{fmtDateFull(client.created_at)}</span>
        </IdentityRow>
        <IdentityRow label="Delivered">
          <span className="font-mono tabular">
            {health.delivered} project{health.delivered === 1 ? "" : "s"}
          </span>
        </IdentityRow>
        <IdentityRow label="On-time rate">
          <span className="font-mono tabular">
            {health.onTimeRate !== null ? fmtPercent(health.onTimeRate) : "—"}
          </span>
        </IdentityRow>
        <IdentityRow label="Revisions per task">
          <span className="font-mono tabular">
            {health.revisionRate !== null ? health.revisionRate.toFixed(1) : "—"}
          </span>
        </IdentityRow>
      </CardBody>
    </Card>
  );
}
