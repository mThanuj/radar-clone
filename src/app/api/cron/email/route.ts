import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/server/cron-auth";
import { dispatchPending } from "@/server/email/outbox";

/**
 * Manual email sweep.
 *
 * Not on a schedule: Vercel Hobby caps cron at once per day, so the daily job
 * (/api/cron/daily) does this at the end of its run. Kept as an endpoint so a
 * stuck outbox can be drained on demand without waiting for tomorrow:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/email
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await dispatchPending(100);
  return NextResponse.json(result);
}
