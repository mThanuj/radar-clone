import "server-only";
import type {
  ActivityKind,
  NotificationCategory,
  NotificationReason,
} from "@/generated/prisma/enums";
import { mostSpecific } from "@/lib/notifications/catalog";
import { classifyReasons, type DiffEntry } from "@/lib/notifications/classify";
import {
  resolveChannels,
  type ChannelPreference,
} from "@/lib/notifications/resolve";
import { enqueueEmail } from "@/server/email/outbox";
import type { Tx } from "@/server/tx";

/**
 * Who hears about a change, and through which channel.
 *
 * Runs in the same transaction as the activity event it describes, so an inbox
 * row can never exist for an event that rolled back — and neither can an
 * email, since the outbox row is written here too.
 *
 * Returns the recipients so the caller can publish to the realtime bus *after*
 * commit. Publishing from inside the transaction would announce changes that
 * may still be rolled back.
 */
export type FanOutArgs = {
  radarId: string;
  eventId: string;
  actorId: string | null;
  kind: ActivityKind;
  /** The field diff recordActivity already computed. */
  changes?: DiffEntry[];
  /**
   * Recipients the diff cannot describe: @mentions, the person just CC'd, the
   * other side of a cross-radar link.
   */
  direct?: { userId: string; reason: NotificationReason }[];
  /** First lines of a new comment, quoted in the email. */
  commentExcerpt?: string | null;
};

export async function fanOut(tx: Tx, args: FanOutArgs): Promise<string[]> {
  const changes = args.changes ?? [];
  const classified = classifyReasons(args.kind, changes);

  if (classified.length === 0 && !args.direct?.length) return [];

  const radar = await tx.radar.findUnique({
    where: { id: args.radarId },
    select: {
      id: true,
      number: true,
      title: true,
      assigneeId: true,
      originatorId: true,
      subscribers: { select: { userId: true, muted: true } },
    },
  });
  if (!radar) return [];

  const previousAssigneeId =
    changes.find((c) => c.field === "assigneeId")?.fromValue ?? null;

  const audiences: Record<string, string[]> = {
    subscribers: radar.subscribers.map((s) => s.userId),
    assignee: radar.assigneeId ? [radar.assigneeId] : [],
    previousAssignee: previousAssigneeId ? [previousAssigneeId] : [],
    originator: [radar.originatorId],
  };

  // Most specific reason wins per person: being assigned beats "a radar you
  // follow changed", even when both are true of the same save.
  const reasonByUser = new Map<string, NotificationReason>();
  const assign = (userId: string, reason: NotificationReason) => {
    const existing = reasonByUser.get(userId);
    reasonByUser.set(userId, existing ? mostSpecific(existing, reason) : reason);
  };

  for (const { reason, audience } of classified) {
    for (const userId of audiences[audience] ?? []) assign(userId, reason);
  }
  for (const entry of args.direct ?? []) assign(entry.userId, entry.reason);

  if (args.actorId) reasonByUser.delete(args.actorId);
  if (reasonByUser.size === 0) return [];

  const userIds = [...reasonByUser.keys()];
  const mutedBy = new Set(
    radar.subscribers.filter((s) => s.muted).map((s) => s.userId),
  );

  const [users, preferences] = await Promise.all([
    tx.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, email: true, name: true, emailEnabled: true },
    }),
    tx.notificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, category: true, inApp: true, email: true },
    }),
  ]);

  const prefsByUser = new Map<
    string,
    Partial<Record<NotificationCategory, ChannelPreference>>
  >();
  for (const pref of preferences) {
    const bucket = prefsByUser.get(pref.userId) ?? {};
    bucket[pref.category] = { inApp: pref.inApp, email: pref.email };
    prefsByUser.set(pref.userId, bucket);
  }

  const delivered: string[] = [];

  for (const user of users) {
    const reason = reasonByUser.get(user.id)!;
    const channels = resolveChannels({
      reason,
      preferences: prefsByUser.get(user.id) ?? {},
      emailEnabled: user.emailEnabled,
      muted: mutedBy.has(user.id),
    });

    if (!channels.inApp && !channels.email) continue;

    // Created one at a time rather than createMany because the email row needs
    // the notification id to stay idempotent.
    const notification = channels.inApp
      ? await tx.notification.create({
          data: {
            recipientId: user.id,
            radarId: radar.id,
            eventId: args.eventId,
            reason,
          },
          select: { id: true },
        })
      : null;

    if (channels.email) {
      await enqueueEmail(tx, {
        recipientId: user.id,
        to: user.email,
        notificationId: notification?.id ?? null,
        reason,
        radar: { number: radar.number, title: radar.title },
        actorId: args.actorId,
        changes,
        commentExcerpt: args.commentExcerpt ?? null,
      });
    }

    if (channels.inApp) delivered.push(user.id);
  }

  return delivered;
}

/**
 * Everyone who follows a radar. Used by call sites that must notify the *other*
 * side of a cross-radar action — the canonical radar of a duplicate, or the
 * radar a new blocker points at — since the diff only describes the radar
 * being edited.
 */
export async function radarAudience(
  tx: Tx,
  radarId: string,
): Promise<string[]> {
  const [subscribers, radar] = await Promise.all([
    tx.radarSubscriber.findMany({
      where: { radarId, muted: false },
      select: { userId: true },
    }),
    tx.radar.findUnique({
      where: { id: radarId },
      select: { originatorId: true, assigneeId: true },
    }),
  ]);

  return [
    ...new Set(
      [
        ...subscribers.map((s) => s.userId),
        radar?.originatorId,
        radar?.assigneeId,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
