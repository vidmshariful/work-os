import Link from "next/link";
import { ListRow } from "@/components/primitives/list-row";
import { ClientStageChip, ConfidentialChip } from "@/components/primitives/tag";
import { CodeLabel } from "@/components/primitives/misc";
import { PersonAvatar } from "@/components/primitives/avatar";
import { clientLabel, isConfidential, isUnmasked } from "@/lib/wall";
import { fmtMoney } from "@/lib/format";
import type { VClient } from "@/lib/types";
import type { OwnerProfile } from "./queries";

// One client row for the list. The row decides per record from isUnmasked:
// above the wall it leads with the commercial name, below the wall the code
// is the whole identity and the row simply has fewer columns.
export function ClientRow({
  client,
  owner,
  ws,
  outstanding,
}: {
  client: VClient;
  owner: OwnerProfile | null;
  ws: string;
  outstanding?: number | null;
}) {
  const unmasked = isUnmasked(client);

  const openAction = (
    <Link
      href={`/${ws}/clients/${client.id}`}
      className="rounded-[8px] px-2.5 py-1 text-meta font-medium text-brand opacity-0 transition-opacity hover:bg-brand-soft group-hover:opacity-100"
    >
      Open
    </Link>
  );

  const ownerCell = owner ? (
    <span className="flex items-center gap-2">
      <PersonAvatar name={owner.full_name} src={owner.avatar_url} size={24} />
      <span className="hidden text-meta text-text-2 md:inline">
        {owner.full_name}
      </span>
    </span>
  ) : (
    <span className="text-meta text-text-3">Unassigned</span>
  );

  if (!unmasked) {
    return (
      <ListRow
        title={
          <CodeLabel code={client.code} className="text-body text-text-1" />
        }
        meta={
          <>
            <ClientStageChip stage={client.stage} />
            {ownerCell}
          </>
        }
        trailing={openAction}
      />
    );
  }

  return (
    <ListRow
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{clientLabel(client)}</span>
          {isConfidential(client) ? <ConfidentialChip /> : null}
        </span>
      }
      subtitle={<CodeLabel code={client.code} />}
      meta={
        <>
          {ownerCell}
          {outstanding && outstanding > 0 ? (
            <span
              className="hidden font-mono text-meta font-medium text-wall tabular lg:inline"
              title="Outstanding payments"
            >
              {fmtMoney(outstanding)} due
            </span>
          ) : null}
          <ClientStageChip stage={client.stage} />
          <span className="w-24 text-right font-mono text-meta font-medium text-text-1 tabular">
            {client.contract_value !== null ? fmtMoney(client.contract_value) : ""}
          </span>
        </>
      }
      trailing={openAction}
    />
  );
}
