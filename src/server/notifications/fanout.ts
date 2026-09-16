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
import { enqueueEmails } from "@/server/email/outbox";
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

  // "assignee" is the audit field key for the assigneeId column; see
  // AUDITED_COLUMNS in src/server/activity/record.ts.
  const previousAssigneeId =
    changes.find((c) => c.field === "assignee")?.fromValue ?? null;

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
  const mailable: {
    recipientId: string;
    to: string;
    reason: NotificationReason;
  }[] = [];

  for (const user of users) {
    const reason = reasonByUser.get(user.id)!;
    const channels = resolveChannels({
      reason,
      preferences: prefsByUser.get(user.id) ?? {},
      emailEnabled: user.emailEnabled,
      muted: mutedBy.has(user.id),
    });

    if (channels.inApp) delivered.push(user.id);
    if (channels.email) {
      mailable.push({ recipientId: user.id, to: user.email, reason });
    }
  }

  if (delivered.length === 0 && mailable.length === 0) return [];

  // createMany and then read the ids back, rather than a create per person:
  // @all reaches every account, and a round trip each is what would push this
  // transaction past its timeout. The read back is exact because eventId
  // belongs to this event alone.
  if (delivered.length > 0) {
    await tx.notification.createMany({
      data: delivered.map((userId) => ({
        recipientId: userId,
        radarId: radar.id,
        eventId: args.eventId,
        reason: reasonByUser.get(userId)!,
      })),
    });
  }

  if (mailable.length > 0) {
    // The email row carries its notification's id, and the unique constraint
    // on it is what makes redelivery safe.
    const created = delivered.length
      ? await tx.notification.findMany({
          where: { eventId: args.eventId, recipientId: { in: delivered } },
          select: { id: true, recipientId: true },
        })
      : [];
    const idByRecipient = new Map(created.map((n) => [n.recipientId, n.id]));

    const actor = args.actorId
      ? await tx.user.findUnique({
          where: { id: args.actorId },
          select: { name: true },
        })
      : null;

    await enqueueEmails(tx, {
      actorName: actor?.name ?? null,
      radar: { number: radar.number, title: radar.title },
      changes,
      commentExcerpt: args.commentExcerpt ?? null,
      messages: mailable.map((message) => ({
        ...message,
        notificationId: idByRecipient.get(message.recipientId) ?? null,
      })),
    });
  }

  return delivered;
}

/**
 * Everyone with an account, minus the actor. What an @all expands to.
 *
 * Deliberately not the radar's followers: the point of a broadcast is to reach
 * people who are *not* following it. Deactivated accounts are left out — they
 * cannot read an inbox, and their address may not be theirs any more.
 *
 * This is the audience, not the delivery list. fanOut still applies each
 * person's own preferences, and MENTIONED_ALL is not forced, so a mute or a
 * switched-off category still wins.
 */
export async function everyoneAudience(
  tx: Tx,
  exceptUserId: string | null,
): Promise<string[]> {
  const users = await tx.user.findMany({
    where: {
      isActive: true,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
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
