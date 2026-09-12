import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { isRealtimeEnabled, publish } from "@/server/realtime/bus";

/**
 * Push to each recipient after the response flushes.
 *
 * Deliberately after commit, never inside the transaction: publishing from
 * inside would announce a change that can still roll back, and a rolled-back
 * toast is worse than a slightly late one.
 *
 * Each recipient gets their own unread count, because the badge is per-person.
 */
export function schedulePush(recipientIds: string[]): void {
  if (recipientIds.length === 0 || !isRealtimeEnabled()) return;

  after(async () => {
    try {
      await Promise.all(
        recipientIds.map(async (recipientId) => {
          const [unreadCount, latest] = await Promise.all([
            db.notification.count({ where: { recipientId, readAt: null } }),
            db.notification.findFirst({
              where: { recipientId },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                reason: true,
                radar: { select: { number: true, title: true } },
              },
            }),
          ]);

          if (!latest) return;

          await publish(recipientId, {
            type: "notification",
            unreadCount,
            notification: {
              id: latest.id,
              reason: latest.reason,
              radarNumber: latest.radar.number,
              radarTitle: latest.radar.title,
            },
          });
        }),
      );
    } catch (error) {
      console.error("realtime push failed", error);
    }
  });
}
