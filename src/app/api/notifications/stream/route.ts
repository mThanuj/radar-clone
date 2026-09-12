import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/server/guards";
import { subscribe } from "@/server/realtime/bus";

/**
 * SSE relay.
 *
 * Authorization happens here, server-side, and the route only ever subscribes
 * to the signed-in user's own channel — which is why no Upstash credential
 * ever reaches the browser.
 */
export const dynamic = "force-dynamic";
// Vercel caps function duration; EventSource reconnects on its own, so a
// bounded stream is fine. Keeping it under the limit avoids an abrupt kill
// mid-frame.
export const maxDuration = 300;

const STREAM_MS = 4 * 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;

export async function GET(request: Request) {
  const user = await requireUser();

  const encoder = new TextEncoder();
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream({
    async start(queue) {
      const send = (chunk: string) => {
        try {
          queue.enqueue(encoder.encode(chunk));
        } catch {
          // Client vanished mid-write; the abort handler tidies up.
        }
      };

      // Proxies drop idle connections, so say something periodically. A
      // comment frame is ignored by EventSource but keeps the socket warm.
      const heartbeat = setInterval(() => send(`: keep-alive\n\n`), HEARTBEAT_MS);
      const deadline = setTimeout(() => controller.abort(), STREAM_MS);

      send(`retry: 3000\n\n`);
      const unread = await db.notification.count({
        where: { recipientId: user.id, readAt: null },
      });
      send(`data: ${JSON.stringify({ type: "hello", unreadCount: unread })}\n\n`);

      try {
        for await (const event of subscribe(user.id, controller.signal)) {
          send(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch {
        // Aborts land here on close; nothing to report.
      } finally {
        clearInterval(heartbeat);
        clearTimeout(deadline);
        try {
          queue.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  after(() => controller.abort());

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer streamed responses without this.
      "x-accel-buffering": "no",
    },
  });
}
