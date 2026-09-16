import "server-only";
import { after } from "next/server";
import { publishMany, type RealtimeEvent } from "@/server/realtime/bus";
import type { ChatMessageRow } from "@/server/chat/queries";

/**
 * Getting a chat message to the other people on the radar.
 *
 * Deliberately *not* a per-radar channel. The bus's safety is structural: the
 * SSE route derives the channel from the session, so a client can only ever
 * receive its own, and no Upstash credential reaches the browser. A channel the
 * client names would move that guarantee into re-authorization logic that runs
 * on every reconnect — at exactly the point where getting it wrong leaks
 * private text. Publishing to each member's existing channel costs one PUBLISH
 * per member and changes nothing about the relay, which forwards any event
 * verbatim.
 *
 * Not schedulePush() either: that one is notification-shaped by construction,
 * re-reading each recipient's unread count and publishing a frame that would
 * move the inbox badge. Chat notifies nobody.
 *
 * after(), like schedulePush, so it runs post-response — and post-commit,
 * because announcing a message that can still roll back is the one ordering bug
 * this has to avoid.
 */
function push(memberIds: string[], event: RealtimeEvent): void {
  if (memberIds.length === 0) return;
  after(async () => {
    try {
      await publishMany(memberIds, () => event);
    } catch (error) {
      console.error("chat push failed", error);
    }
  });
}

export function scheduleChatPush(args: {
  memberIds: string[];
  radarId: string;
  radarNumber: number;
  message: ChatMessageRow;
}): void {
  // The author is on the list on purpose. Leaving them off looks tidier and
  // silently breaks the same-person-two-tabs case; the client de-duplicates on
  // message id anyway, which is what makes that dedupe load-bearing.
  push(args.memberIds, {
    type: "chat",
    radarId: args.radarId,
    radarNumber: args.radarNumber,
    message: {
      id: args.message.id,
      body: args.message.body,
      createdAt: args.message.createdAt.toISOString(),
      author: args.message.author,
    },
  });
}

export function scheduleChatRemovalPush(args: {
  memberIds: string[];
  radarId: string;
  radarNumber: number;
  messageId: string;
}): void {
  push(args.memberIds, {
    type: "chat-removed",
    radarId: args.radarId,
    radarNumber: args.radarNumber,
    messageId: args.messageId,
  });
}
