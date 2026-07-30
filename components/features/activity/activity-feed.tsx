import { PersonAvatar } from "@/components/primitives/avatar";
import { fmtTimeAgo } from "@/lib/format";
import { describeActivity, type ActivityItem } from "./activity-panel";

export interface FeedComment {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string; avatar_url: string | null } | null;
}

// One rail feed carrying both what the system recorded and what people said,
// in the order it happened. The composer is passed in, so the same feed serves
// a task and a project without either knowing about the other's action.
//
// Wall note: activity_log entries are brand-blind, and a comment is visible to
// exactly whoever can already see the parent record, so this adds no wall
// surface beyond what that record already has.
type FeedEntry =
  | { kind: "activity"; id: string; at: string; activity: ActivityItem }
  | { kind: "comment"; id: string; at: string; comment: FeedComment };

export function ActivityFeed({
  activity,
  comments,
  composer,
}: {
  activity: ActivityItem[];
  comments: FeedComment[];
  composer: React.ReactNode;
}) {
  const feed: FeedEntry[] = [
    ...activity.map((a) => ({
      kind: "activity" as const,
      id: `a-${a.id}`,
      at: a.created_at,
      activity: a,
    })),
    ...comments.map((c) => ({
      kind: "comment" as const,
      id: `c-${c.id}`,
      at: c.created_at,
      comment: c,
    })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <div className="flex flex-col gap-3">
      {feed.length === 0 ? (
        <p className="py-2 text-center text-[12.5px] text-text-3">
          Nothing here yet. Add the first comment.
        </p>
      ) : (
        // Oldest at the top so the thread reads down to the newest, with the
        // composer directly under it.
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {feed.map((entry) =>
            entry.kind === "comment" ? (
              <div key={entry.id} className="flex gap-2.5">
                <PersonAvatar
                  name={entry.comment.author?.full_name}
                  src={entry.comment.author?.avatar_url}
                  size={24}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug">
                    <span className="font-medium text-text-1">
                      {entry.comment.author?.full_name ?? "Someone"}
                    </span>{" "}
                    <span className="text-text-3">
                      {fmtTimeAgo(entry.comment.created_at)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap rounded-[9px] bg-surface-2 px-2.5 py-1.5 text-[13px] leading-relaxed text-text-1">
                    {entry.comment.body}
                  </p>
                </div>
              </div>
            ) : (
              <div key={entry.id} className="flex gap-2.5">
                <PersonAvatar
                  name={entry.activity.actor?.full_name ?? "System"}
                  src={entry.activity.actor?.avatar_url}
                  size={24}
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-snug text-text-1">
                    <span className="font-medium">
                      {entry.activity.actor?.full_name ?? "System"}
                    </span>{" "}
                    <span className="text-text-2">
                      {describeActivity(entry.activity.verb, entry.activity.detail)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-text-3">
                    {fmtTimeAgo(entry.activity.created_at)}
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">{composer}</div>
    </div>
  );
}
