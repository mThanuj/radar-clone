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

/**
 * A bare string outside the React tree, so no Tailwind and no theme provider —
 * the colours have to be spelled out. They mirror the tokens in globals.css
 * (#0a0a0a is oklch(0.145), #171717 is oklch(0.205)); `color-scheme` makes the
 * UA follow along for scrollbars and the focus ring.
 */
function page(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<style>
  :root { color-scheme: light dark; --bg:#f6f6f5; --card:#fff; --fg:#171717; --muted:#525252; --line:#c9c9c9; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0a0a0a; --card:#171717; --fg:#fafafa; --muted:#a1a1a1; --line:#3d3d3d; }
  }
</style></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--fg);">
  <main style="max-width:420px;padding:32px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-align:center;">
    <h1 style="margin:0 0 8px;font-size:16px;">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:var(--muted);">${body}</p>
    <a href="/settings/notifications" style="font-size:13px;color:var(--fg);">Notification settings</a>
  </main>
</body></html>`;
}
