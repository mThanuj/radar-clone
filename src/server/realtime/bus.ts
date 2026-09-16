import "server-only";
import { env } from "@/lib/env";

/**
 * Realtime bus.
 *
 * Two methods, so the transport is swappable: if the SSE relay's cost on
 * serverless becomes annoying, Postgres LISTEN/NOTIFY (verified working on this
 * Neon instance) can replace Upstash by rewriting this file alone.
 *
 * Implemented against Upstash's REST API rather than its SDK — publish is one
 * POST and subscribe is one streaming GET, which is less surface than a client
 * library and one fewer dependency.
 *
 * Upstash config is required (see src/lib/env.ts), so this never silently
 * no-ops because of a missing variable. The client still falls back to polling
 * after repeated stream failures — that covers the broker being *down*, which
 * is a different problem from it being unconfigured.
 */
export type RealtimeEvent =
  | {
      type: "notification";
      unreadCount: number;
      notification: {
        id: string;
        reason: string;
        radarNumber: number;
        radarTitle: string;
      };
    }
  /**
   * A radar chat message, addressed to each member's own channel rather than a
   * channel of its own — see src/server/chat/publish.ts for why. The whole
   * message rides along, author included, so the panel renders it without a
   * follow-up fetch and without an avatar that pops in late. `createdAt` is an
   * ISO string because this crosses JSON.stringify twice on its way to the
   * browser.
   */
  | {
      type: "chat";
      radarId: string;
      radarNumber: number;
      message: {
        id: string;
        body: string;
        createdAt: string;
        author: {
          id: string;
          name: string;
          handle: string;
          image: string | null;
        };
      };
    }
  | {
      type: "chat-removed";
      radarId: string;
      radarNumber: number;
      messageId: string;
    }
  | { type: "ping" };

const restUrl = () => env.UPSTASH_REDIS_REST_URL;
const restToken = () => env.UPSTASH_REDIS_REST_TOKEN;

/** One channel per user; the SSE route is what enforces you only get your own. */
export const channelFor = (userId: string) => `radar:user:${userId}`;

/**
 * Publish must never break the thing that triggered it — a realtime blip is
 * not a reason to fail a save, and the inbox row is already committed.
 */
export async function publish(
  userId: string,
  event: RealtimeEvent,
): Promise<void> {

  try {
    await fetch(restUrl(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${restToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(["PUBLISH", channelFor(userId), JSON.stringify(event)]),
      cache: "no-store",
    });
  } catch (error) {
    console.error("realtime publish failed", error);
  }
}

export async function publishMany(
  userIds: string[],
  build: (userId: string) => Promise<RealtimeEvent> | RealtimeEvent,
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all(
    userIds.map(async (userId) => publish(userId, await build(userId))),
  );
}

/**
 * Open Upstash's streaming subscribe and yield each message. The caller owns
 * the AbortSignal, so closing the browser tab tears the upstream read down too.
 */
export async function* subscribe(
  userId: string,
  signal: AbortSignal,
): AsyncGenerator<RealtimeEvent> {

  const response = await fetch(
    `${restUrl()}/subscribe/${encodeURIComponent(channelFor(userId))}`,
    {
      headers: {
        authorization: `Bearer ${restToken()}`,
        accept: "text/event-stream",
      },
      signal,
      cache: "no-store",
    },
  );

  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      // Upstash frames as: message,<channel>,<payload>
      const raw = line.slice(5).trim();
      const payload = raw.startsWith("message,")
        ? raw.slice(raw.indexOf(",", 8) + 1)
        : raw;
      try {
        yield JSON.parse(payload) as RealtimeEvent;
      } catch {
        // A frame we don't understand is not worth killing the stream over.
      }
    }
  }
}
