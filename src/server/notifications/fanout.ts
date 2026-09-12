import "server-only";
import type { ActivityKind, NotificationReason } from "@/generated/prisma/enums";
import type { Tx } from "@/server/tx";

/**
 * Who hears about a change.
 *
 * Runs in the same transaction as the activity event it describes, so an
 * inbox entry can never exist for an event that rolled back — and vice versa.
 * The actor is always excluded; nobody wants to be notified about their own
 * typing.
 */
export async function fanOut(
  tx: Tx,
  args: {
    radarId: string;
    eventId: string;
    actorId: string | null;
    kind: ActivityKind;
    /** Explicit extras: a new assignee, freshly CC'd people, @mentions. */
    direct?: { userId: string; reason: NotificationReason }[];
    stateChanged?: boolean;
  },
): Promise<number> {
  const reasonByUser = new Map<string, NotificationReason>();

  for (const entry of args.direct ?? []) {
    reasonByUser.set(entry.userId, entry.reason);
  }

  const radar = await tx.radar.findUnique({
    where: { id: args.radarId },
    select: {
      assigneeId: true,
      originatorId: true,
      subscribers: {
        where: { muted: false },
        select: { userId: true },
      },
    },
  });
  if (!radar) return 0;

  const ambient: NotificationReason =
    args.kind === "COMMENT_ADDED"
      ? "COMMENTED"
      : args.stateChanged
        ? "STATE_CHANGED"
        : "SUBSCRIBED";

  for (const s of radar.subscribers) {
    if (!reasonByUser.has(s.userId)) reasonByUser.set(s.userId, ambient);
  }
  if (radar.assigneeId && !reasonByUser.has(radar.assigneeId)) {
    reasonByUser.set(radar.assigneeId, ambient);
  }
  if (radar.originatorId && !reasonByUser.has(radar.originatorId)) {
    reasonByUser.set(radar.originatorId, ambient);
  }

  if (args.actorId) reasonByUser.delete(args.actorId);
  if (reasonByUser.size === 0) return 0;

  await tx.notification.createMany({
    data: [...reasonByUser].map(([recipientId, reason]) => ({
      recipientId,
      radarId: args.radarId,
      eventId: args.eventId,
      reason,
    })),
  });

  return reasonByUser.size;
}
