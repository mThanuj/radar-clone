import "server-only";
import { after } from "next/server";
import type { NotificationReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { categoryOf } from "@/lib/notifications/catalog";
import type { DiffEntry } from "@/lib/notifications/classify";
import { renderEmail, type EmailPayload } from "@/server/email/templates";
import { fromAddress, getTransport, isLiveMail } from "@/server/email/transport";
import { unsubscribeUrl } from "@/server/email/unsubscribe";
import type { Tx } from "@/server/tx";

const MAX_ATTEMPTS = 5;
/** Backoff per attempt, in minutes. */
const BACKOFF = [1, 5, 15, 60, 180];
/**
 * How long a row may sit in SENDING before another sweep is allowed to take
 * it back.
 *
 * Claiming flips the row to SENDING in its own statement, so a process that
 * dies between the claim and the send — a serverless invocation cut off while
 * running post-response work, a deploy mid-flight — leaves a row no sweep can
 * ever pick up again, because PENDING/FAILED are the only statuses it looks
 * for. That is silent permanent loss, which is the worst failure this queue
 * can have. Longer than any plausible SMTP handshake, so it cannot steal a
 * send that is merely slow.
 */
const CLAIM_TIMEOUT_MINUTES = 10;

/**
 * Queue an email inside the caller's transaction.
 *
 * Writing the outbox row transactionally with the Notification is what makes
 * delivery safe in both directions: mail cannot be sent for a change that
 * rolled back, and a change cannot commit while silently losing its mail.
 */
export async function enqueueEmail(
  tx: Tx,
  args: {
    recipientId: string;
    to: string;
    notificationId: string | null;
    reason: NotificationReason;
    radar: { number: number; title: string };
    actorId: string | null;
    changes: DiffEntry[];
    commentExcerpt?: string | null;
  },
) {
  const actor = args.actorId
    ? await tx.user.findUnique({
        where: { id: args.actorId },
        select: { name: true },
      })
    : null;

  const payload: EmailPayload = {
    reason: args.reason,
    radar: args.radar,
    actorName: actor?.name ?? null,
    changes: args.changes.map((c) => ({
      field: c.field,
      fromLabel: (c as { fromLabel?: string | null }).fromLabel ?? null,
      toLabel: (c as { toLabel?: string | null }).toLabel ?? null,
    })),
    commentExcerpt: args.commentExcerpt ?? null,
    radarUrl: appUrl(`/radars/${args.radar.number}`),
    settingsUrl: appUrl("/settings/notifications"),
    unsubscribeUrl: unsubscribeUrl(args.recipientId, categoryOf(args.reason)),
  };

  const { subject } = renderEmail(payload);

  await tx.emailMessage.create({
    data: {
      recipientId: args.recipientId,
      notificationId: args.notificationId,
      to: args.to,
      subject,
      template: args.reason,
      payload: payload as unknown as object,
    },
  });
}

/**
 * Claim and send queued mail.
 *
 * Claiming is a single UPDATE guarded by FOR UPDATE SKIP LOCKED, so the
 * post-response dispatcher and the cron sweep can run at the same moment and
 * still never send the same row twice.
 */
export async function dispatchPending(limit = 25): Promise<{
  sent: number;
  failed: number;
}> {
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "EmailMessage"
       SET status = 'SENDING', attempts = attempts + 1, "updatedAt" = now()
     WHERE id IN (
       SELECT id FROM "EmailMessage"
        WHERE attempts < ${MAX_ATTEMPTS}
          AND (
            (status IN ('PENDING', 'FAILED') AND "scheduledFor" <= now())
            OR (
              status = 'SENDING'
              AND "updatedAt" <
                  now() - make_interval(mins => ${CLAIM_TIMEOUT_MINUTES}::int)
            )
          )
        ORDER BY "scheduledFor"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id`;

  if (claimed.length === 0) return { sent: 0, failed: 0 };

  const messages = await db.emailMessage.findMany({
    where: { id: { in: claimed.map((row) => row.id) } },
    select: {
      id: true,
      to: true,
      subject: true,
      payload: true,
      attempts: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      const rendered = renderEmail(message.payload as unknown as EmailPayload);
      await getTransport().sendMail({
        from: fromAddress(),
        to: message.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      await db.emailMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent += 1;

      if (!isLiveMail()) {
        console.info(`[email:dev] ${message.subject} -> ${message.to}`);
      }
    } catch (error) {
      const minutes = BACKOFF[Math.min(message.attempts - 1, BACKOFF.length - 1)];
      await db.emailMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          lastError: error instanceof Error ? error.message : String(error),
          scheduledFor: new Date(Date.now() + minutes * 60_000),
        },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * What the queue looks like right now.
 *
 * Exists because "no mail arrived" has two completely different causes that
 * look identical from outside: fan-out never queued anything (nobody to tell —
 * remember it drops the actor, so a one-account deployment can never notify
 * anyone), or it queued and delivery is failing. One authenticated request to
 * /api/cron/email tells them apart on a deployment whose database you can't
 * open a psql session against.
 */
export async function outboxSummary() {
  const [byStatus, oldestUnsent, lastFailure, notifications, activeUsers] =
    await Promise.all([
      db.emailMessage.groupBy({ by: ["status"], _count: { _all: true } }),
      db.emailMessage.findFirst({
        where: { status: { in: ["PENDING", "FAILED", "SENDING"] } },
        orderBy: { scheduledFor: "asc" },
        select: { scheduledFor: true, status: true, template: true },
      }),
      db.emailMessage.findFirst({
        where: { lastError: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true, attempts: true, lastError: true },
      }),
      db.notification.count(),
      db.user.count({ where: { isActive: true } }),
    ]);

  return {
    byStatus: Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all]),
    ),
    oldestUnsent,
    lastFailure,
    // Zero notifications alongside zero queued mail means fan-out is finding
    // nobody, which is a different problem from mail that will not send.
    notifications,
    activeUsers,
  };
}

/**
 * Fire-and-forget wrapper for the request path. Never throws: a mail problem
 * must not turn a successful save into an error the user sees, and the cron
 * sweep will retry whatever is left behind.
 */
export async function dispatchQuietly(): Promise<void> {
  try {
    await dispatchPending();
  } catch (error) {
    console.error("email dispatch failed", error);
  }
}

/**
 * Send queued mail once the response has flushed, so a slow SMTP handshake
 * never shows up as a slow save. Safe to call from any action — with nothing
 * queued it does nothing.
 */
export function scheduleEmailDispatch(): void {
  after(dispatchQuietly);
}
