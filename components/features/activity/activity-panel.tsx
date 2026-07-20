import { PersonAvatar } from "@/components/primitives/avatar";
import { fmtDate, fmtTimeAgo } from "@/lib/format";

// One entry from activity_log, with its actor resolved. Rendered on task and
// project detail. Everything here is brand-blind, so it is safe below the wall.
export interface ActivityItem {
  id: string;
  verb: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string; avatar_url: string | null } | null;
}

function humanizeStatus(value: unknown): string {
  return String(value ?? "").replace(/_/g, " ");
}

// Turn a logged verb into a readable clause. The actor's name is rendered
// separately, so these read as "<Name> moved this to review".
function describe(verb: string, detail: Record<string, unknown>): string {
  switch (verb) {
    case "status_changed":
      return `moved this to ${humanizeStatus(detail.to)}`;
    case "reassigned":
      return detail.to_name ? `assigned this to ${detail.to_name}` : "unassigned this";
    case "owner_changed":
      return detail.to_name
        ? `changed the owner to ${detail.to_name}`
        : "removed the owner";
    case "due_changed":
      return detail.to
        ? `set the due date to ${fmtDate(String(detail.to))}`
        : "cleared the due date";
    default:
      return verb.replace(/_/g, " ");
  }
}

export function ActivityPanel({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-2 text-center text-[12.5px] text-text-3">No activity yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((a) => {
        const name = a.actor?.full_name ?? "System";
        return (
          <div key={a.id} className="flex gap-2.5">
            <PersonAvatar name={name} src={a.actor?.avatar_url} size={24} />
            <div className="min-w-0">
              <p className="text-[12.5px] leading-snug text-text-1">
                <span className="font-medium">{name}</span>{" "}
                <span className="text-text-2">{describe(a.verb, a.detail)}</span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-text-3">
                {fmtTimeAgo(a.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
