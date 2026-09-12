import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/server/cron-auth";
import { withAudit } from "@/server/context";
import { recordActivity } from "@/server/activity/record";
import { dispatchPending } from "@/server/email/outbox";
import type { Tx } from "@/server/tx";

/**
 * The one scheduled job.
 *
 * Vercel's Hobby plan allows cron only once per day, so both scheduled
 * concerns live here: raise DUE_SOON notifications, then sweep the email
 * outbox.
 *
 * Losing the five-minute email sweep costs less than it sounds. Every
 * mutation already calls scheduleEmailDispatch(), and that claims the *whole*
 * pending backlog rather than just the rows it created — so a failed message
 * is retried the next time anyone touches a radar. This job is the backstop
 * for stretches where nobody uses the app at all.
 *
 * Repeats are guarded by checking for a DUE_SOON notification already raised
 * for that radar in the last day: cron can fire more than once, and nobody
 * wants the same nudge twice.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const due = await db.radar.findMany({
    where: {
      dueDate: { not: null, lte: cutoff },
      state: { not: "CLOSED" },
      assigneeId: { not: null },
      notifications: {
        none: { reason: "DUE_SOON", createdAt: { gte: yesterday } },
      },
    },
    select: { id: true, assigneeId: true },
    take: 200,
  });

  for (const radar of due) {
    // System-driven, so there is no actor to exclude.
    await withAudit(null, () =>
      db.$transaction((tx) =>
        recordActivity(tx as Tx, {
          radarId: radar.id,
          actorId: null,
          kind: "FIELDS_CHANGED",
          changes: [{ field: "dueDate", toValue: "due", toLabel: "within 24 hours" }],
          direct: [{ userId: radar.assigneeId!, reason: "DUE_SOON" }],
        }),
      ),
    );
  }

  const dispatched = await dispatchPending(100);
  return NextResponse.json({ notified: due.length, ...dispatched });
}
