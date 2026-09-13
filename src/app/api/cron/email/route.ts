import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/server/cron-auth";
import { dispatchPending, outboxSummary } from "@/server/email/outbox";
import { verifyTransport } from "@/server/email/transport";

/**
 * Manual email sweep, and the diagnostic for "no mail is arriving".
 *
 * Not on a schedule: Vercel Hobby caps cron at once per day, so the daily job
 * (/api/cron/daily) does this at the end of its run. Kept as an endpoint so a
 * stuck outbox can be drained on demand without waiting for tomorrow:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/email
 *
 * It answers the queue's state as well as draining it, because the two ways
 * mail goes missing — nothing was ever queued, or queued mail will not send —
 * are indistinguishable from the outside and need opposite fixes. Add
 * ?verify=1 to also prove the SMTP credentials, the same check the settings
 * page runs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dispatched = await dispatchPending(100);
  const queue = await outboxSummary();
  const smtp = request.nextUrl.searchParams.has("verify")
    ? await verifyTransport()
    : undefined;

  return NextResponse.json({ dispatched, queue, smtp });
}
