"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { auditFieldLabel, isProseField } from "@/lib/radar/audit-labels";
import { dayKey, dayLabel } from "@/lib/radar/format";
import type { TimelineEvent } from "@/server/activity/queries";
import { loadTimelineAction } from "@/server/activity/actions";
import { Avatar } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";

function summarize(event: TimelineEvent): React.ReactNode {
  switch (event.kind) {
    case "RADAR_CREATED":
      return <span className="text-muted-foreground">filed this radar</span>;
    case "COMMENT_ADDED":
      return (
        <span className="text-muted-foreground">
          commented
          {event.comment?.body && (
            <span className="text-foreground ml-1.5">
              “{event.comment.body.slice(0, 80)}
              {event.comment.body.length > 80 ? "…" : ""}”
            </span>
          )}
        </span>
      );
    case "COMMENT_EDITED":
      return <span className="text-muted-foreground">edited a comment</span>;
    case "COMMENT_DELETED":
      return <span className="text-muted-foreground">deleted a comment</span>;
    default:
      break;
  }

  if (event.changes.length === 0) {
    return <span className="text-muted-foreground">made a change</span>;
  }

  return (
    <span className="text-muted-foreground flex flex-wrap gap-x-1.5">
      {event.changes.slice(0, 3).map((change) => (
        <span key={change.id}>
          <span className="text-foreground font-medium">
            {auditFieldLabel(change.field)}
          </span>{" "}
          {isProseField(change.field) ? (
            "edited"
          ) : (
            <>
              {change.fromLabel && <>{change.fromLabel} → </>}
              <span className="text-foreground">{change.toLabel ?? "empty"}</span>
            </>
          )}
        </span>
      ))}
      {event.changes.length > 3 && (
        <span>+{event.changes.length - 3} more</span>
      )}
    </span>
  );
}

export function TimelineList({
  initialEvents,
  initialCursor,
  filters,
}: {
  initialEvents: TimelineEvent[];
  initialCursor: string | null;
  filters: { actorId?: string; field?: string };
}) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const next = await loadTimelineAction({ cursor, filters });
      setEvents((current) => [...current, ...next.events]);
      setCursor(next.nextCursor);
    });
  }

  // Day boundaries are derived up front rather than tracked with a mutable
  // cursor during render — that reassignment isn't safe across renders.
  const rows = useMemo(
    () =>
      events.map((event, index) => ({
        event,
        startsDay:
          index === 0 ||
          dayKey(event.createdAt) !== dayKey(events[index - 1].createdAt),
      })),
    [events],
  );

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map(({ event, startsDay }) => (
        <Fragment key={event.id}>
          {startsDay && (
            <h2 className="bg-background text-muted-foreground sticky top-0 z-10 py-2 text-xs font-medium">
              {dayLabel(event.createdAt)}
            </h2>
          )}
          <div className="flex items-start gap-3 border-b py-2 text-sm last:border-0">
            <time
              dateTime={new Date(event.createdAt).toISOString()}
              className="text-muted-foreground w-12 shrink-0 pt-0.5 text-xs tabular-nums"
            >
              {format(new Date(event.createdAt), "HH:mm")}
            </time>

            <Link
              href={`/radars/${event.radar.number}`}
              className="text-muted-foreground hidden w-24 shrink-0 pt-0.5 font-mono text-xs tabular-nums hover:underline sm:block"
            >
              {event.radar.number}
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/radars/${event.radar.number}`}
                className="block truncate font-medium hover:underline"
              >
                {event.radar.title}
              </Link>
              <div className="mt-0.5 text-xs">{summarize(event)}</div>
            </div>

            <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
              {event.actor && <Avatar person={event.actor} size={18} />}
              {/* Avatar is aria-hidden, so below sm the actor would be
                  conveyed to nobody if this were `hidden`. */}
              <span className="text-muted-foreground text-xs max-sm:sr-only sm:inline">
                {event.actor?.name ?? "System"}
              </span>
            </span>
          </div>
        </Fragment>
      ))}

      {cursor && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? "Loading…" : "Load more"}
          </Button>
          {/* Rows are appended in place; without this the page silently grows. */}
          <p role="status" aria-live="polite" className="sr-only">
            {pending ? "Loading more activity" : `${events.length} events loaded`}
          </p>
        </div>
      )}
    </div>
  );
}
