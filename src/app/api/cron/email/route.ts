import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/server/cron-auth";
import { dispatchPending } from "@/server/email/outbox";

/**
 * Retry sweep. The request path already dispatches via after(), so this only
 * picks up mail that failed or was left behind when a function was torn down
 * mid-send.
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
