import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/guards";

/**
 * Cheap poll target: an unread count plus the newest notification id.
 *
 * The client compares the id to what it last saw; only when it differs does it
 * fetch the list. That keeps the polling fallback to one small query.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();

  const [unreadCount, latest] = await Promise.all([
    db.notification.count({ where: { recipientId: user.id, readAt: null } }),
    db.notification.findFirst({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        radar: { select: { number: true, title: true } },
      },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    latest: latest
      ? {
          id: latest.id,
          reason: latest.reason,
          radarNumber: latest.radar.number,
          radarTitle: latest.radar.title,
        }
      : null,
  });
}
