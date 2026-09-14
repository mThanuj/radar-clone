import { auditFieldLabel, isProseField } from "@/lib/radar/audit-labels";
import { fullDate, relativeTime } from "@/lib/radar/format";
import type { FeedEvent } from "@/server/activity/queries";
import { Avatar } from "@/components/radar/badges";
import { Markdown } from "@/components/markdown";
import { CommentActions } from "@/components/activity/comment-actions";

/** One "Assignee: Jane -> Sam" line. */
function ChangeLine({
  change,
}: {
  change: FeedEvent["changes"][number];
}) {
  const label = auditFieldLabel(change.field);

  if (isProseField(change.field)) {
    return (
      <li>
        edited <span className="text-foreground font-medium">{label}</span>
      </li>
    );
  }

  if (change.field.startsWith("relation.") || change.field === "cc" || change.field === "watcher") {
    return change.toLabel ? (
      <li>
        added <span className="text-foreground font-medium">{label}</span>{" "}
        <span className="text-foreground">{change.toLabel}</span>
      </li>
    ) : (
      <li>
        removed <span className="text-foreground font-medium">{label}</span>{" "}
        <span className="text-foreground">{change.fromLabel}</span>
      </li>
    );
  }

  return (
    <li>
      set <span className="text-foreground font-medium">{label}</span>{" "}
      {change.fromLabel ? (
        <>
          from <span className="text-foreground">{change.fromLabel}</span>{" "}
        </>
      ) : null}
      to <span className="text-foreground">{change.toLabel ?? "empty"}</span>
    </li>
  );
}

function EventRow({
  event,
  radarNumber,
  currentUserId,
}: {
  event: FeedEvent;
  radarNumber: number;
  currentUserId: string;
}) {
  const actor = event.actor;
  const when = (
    <time
      dateTime={new Date(event.createdAt).toISOString()}
      title={fullDate(event.createdAt)}
      className="text-muted-foreground text-xs"
    >
      {relativeTime(event.createdAt)}
    </time>
  );

  if (event.kind === "COMMENT_ADDED" && event.comment) {
    const comment = event.comment;
    if (comment.deletedAt) {
      return (
        <li className="text-muted-foreground flex items-center gap-2 py-2 text-xs italic">
          <span>Comment deleted</span>
          {when}
        </li>
      );
    }
    return (
      <li className="flex gap-3 py-3">
        <Avatar person={comment.author} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.author.name}</span>
            {when}
            {comment.editedAt && (
              <span className="text-muted-foreground text-xs">(edited)</span>
            )}
            {comment.author.id === currentUserId && (
              <CommentActions
                commentId={comment.id}
                number={radarNumber}
                body={comment.body}
              />
            )}
          </div>
          <div className="bg-muted/40 mt-1.5 rounded-lg px-3 py-2">
            <Markdown>{comment.body}</Markdown>
          </div>
        </div>
      </li>
    );
  }

  if (event.kind === "RADAR_CREATED") {
    return (
      <li className="flex items-center gap-2 py-2 text-xs">
        {actor && <Avatar person={actor} size={18} />}
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">
            {actor?.name ?? "Someone"}
          </span>{" "}
          filed this radar
        </span>
        {when}
      </li>
    );
  }

  if (event.changes.length === 0) return null;

  return (
    <li className="flex gap-2 py-2 text-xs">
      {actor && <Avatar person={actor} size={18} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-xs font-medium">
            {actor?.name ?? "System"}
          </span>
          {when}
        </div>
        <ul className="text-muted-foreground mt-0.5 space-y-0.5">
          {event.changes.map((change) => (
            <ChangeLine key={change.id} change={change} />
          ))}
        </ul>
        {event.note && (
          <p className="text-muted-foreground mt-1 italic">“{event.note}”</p>
        )}
      </div>
    </li>
  );
}

export function ActivityFeed({
  events,
  radarNumber,
  currentUserId,
}: {
  events: FeedEvent[];
  radarNumber: number;
  currentUserId: string;
}) {
  return (
    <ul className="divide-y">
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          radarNumber={radarNumber}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}
