import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/notifications/catalog";
import { verifyUnsubscribeToken } from "@/server/email/unsubscribe";

/**
 * One-click unsubscribe from a mail client. No session — the signed token is
 * the authorisation, and it permits exactly one change: turning email off for
 * one category for one user.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const parsed = token ? verifyUnsubscribeToken(token) : null;

  if (!parsed) {
    return new NextResponse(page("That link isn't valid", "It may have been altered or truncated by your mail client."), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  await db.notificationPreference.upsert({
    where: {
      userId_category: { userId: parsed.userId, category: parsed.category },
    },
    update: { email: false },
    // In-app stays on: unsubscribing from mail shouldn't silence the inbox too.
    create: { userId: parsed.userId, category: parsed.category, email: false, inApp: true },
  });

  const label = CATEGORIES[parsed.category].label.toLowerCase();
  return new NextResponse(
    page(
      "Unsubscribed",
      `You'll no longer get email about ${label}. These notifications still appear in your inbox in the app.`,
    ),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;">
  <div style="max-width:420px;padding:32px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;text-align:center;">
    <h1 style="margin:0 0 8px;font-size:16px;">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#525252;">${body}</p>
    <a href="/settings/notifications" style="font-size:13px;color:#171717;">Notification settings</a>
  </div>
</body></html>`;
}
