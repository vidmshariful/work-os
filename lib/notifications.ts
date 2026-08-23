// Where a notification points. Every notification carries an entity_type and
// entity_id; this resolves them to a route in the notification's own
// workspace. Returns null when there is nothing to open, in which case the
// item renders as plain text rather than a link.
export function notificationHref(
  wsSlug: string,
  entityType: string | null,
  entityId: string | null
): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "task":
      return `/${wsSlug}/tasks/${entityId}`;
    case "project":
      return `/${wsSlug}/projects/${entityId}`;
    case "leave_request":
      return `/${wsSlug}/hr`;
    case "todo":
      return `/${wsSlug}/todos`;
    // Only people above the wall are ever notified about a client, so the
    // client record is a safe place to send them. RLS refuses anyone else
    // regardless of what this returns.
    case "client":
      return `/${wsSlug}/clients/${entityId}`;
    default:
      return null;
  }
}
