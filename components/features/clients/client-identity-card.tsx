import { Card, CardHeader, CardBody } from "@/components/primitives/card";
import { ORIGIN_LABELS } from "@/lib/wall";
import { fmtDateFull, fmtMoney } from "@/lib/format";
import type { VClient } from "@/lib/types";

function IdentityRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <span className="shrink-0 text-[12.5px] text-text-2">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium text-text-1">
        {children}
      </span>
    </div>
  );
}

// Commercial identity, above the wall only. The caller must never render
// this below the wall: down there this data does not exist.
export function ClientIdentityCard({ client }: { client: VClient }) {
  return (
    <Card className="self-start">
      <CardHeader title="Identity" />
      <CardBody>
        <IdentityRow label="Contact name">
          {client.contact_name ?? <span className="font-normal text-text-3">Not set</span>}
        </IdentityRow>
        <IdentityRow label="Contact email">
          {client.contact_email ? (
            <a
              href={`mailto:${client.contact_email}`}
              className="break-all text-brand hover:underline"
            >
              {client.contact_email}
            </a>
          ) : (
            <span className="font-normal text-text-3">Not set</span>
          )}
        </IdentityRow>
        <IdentityRow label="Origin">
          {client.origin ? ORIGIN_LABELS[client.origin] ?? client.origin : "Direct"}
        </IdentityRow>
        <IdentityRow label="Contract value">
          <span className="font-mono tabular">
            {client.contract_value !== null ? (
              fmtMoney(client.contract_value)
            ) : (
              <span className="font-sans font-normal text-text-3">Not set</span>
            )}
          </span>
        </IdentityRow>
        <IdentityRow label="Created">
          <span className="font-mono tabular">{fmtDateFull(client.created_at)}</span>
        </IdentityRow>
      </CardBody>
    </Card>
  );
}
