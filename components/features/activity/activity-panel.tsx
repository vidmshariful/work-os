import { fmtDate } from "@/lib/format";

// The shape of one activity_log row with its actor resolved, and the phrasing
// that turns it into a sentence. Task and project detail both render these
// through ActivityFeed, which interleaves them with comments.
//
// Everything here is brand-blind, so it is safe below the wall.
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
export function describeActivity(
  verb: string,
  detail: Record<string, unknown>
): string {
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
    case "list_changed":
      return detail.to_name
        ? `moved this to ${detail.to_name}`
        : "took this out of its list";
    case "department_changed":
      return detail.to_name
        ? `moved this to the ${detail.to_name} space`
        : "took this out of its space";
    case "parent_changed":
      return detail.to_name
        ? `made this a sub-project of ${detail.to_name}`
        : "promoted this to a top-level project";
    default:
      return verb.replace(/_/g, " ");
  }
}
