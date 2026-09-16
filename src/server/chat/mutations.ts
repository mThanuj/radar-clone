import "server-only";
import type { ChatViewer } from "@/lib/chat/membership";
import { db } from "@/lib/db";
import {
  NO_ACCESS,
  requireChatAccess,
  type ChatAccess,
} from "@/server/chat/access";
import type { ChatMessageRow } from "@/server/chat/queries";

/**
 * Writing to a radar's chat.
 *
 * Separate from actions.ts — and taking an explicit `actor` rather than calling
 * requireUser() — so the integration suite can drive these without a request
 * context, the same split radars/mutations.ts uses. The actions are then four
 * lines of glue each.
 *
 * Several house conventions are deliberately absent here. Each omission is a
 * decision, not an oversight:
 *
 *   - No recordActivity. The activity feed is readable by every signed-in user
 *     and drains into /timeline and the email templates, so private text cannot
 *     go in it — and the audit invariant asserts one radar mutation writes
 *     exactly one ActivityEvent, so chat must write none.
 *   - No withAuditResult. It exists to sanction radar.* writes and to collect
 *     fan-out recipients. Chat does neither.
 *   - No fanOut, no Notification rows, no schedulePush. Chat notifies nobody by
 *     design, and schedulePush publishes a notification-shaped frame that would
 *     move the wrong badge.
 *   - No scheduleEmailDispatch. There is never an outbox row to sweep.
 *   - No lastActivityAt bump. A private side conversation must not reorder the
 *     public queue or clear a radar out of the "stale" views.
 *   - No RadarSubscriber upsert. addCommentAction auto-watches because
 *     commenting is a public act of interest; here you are already on the radar
 *     — that is why you can post — and a silent WATCHER row would change your
 *     *public* notification volume as a side effect of a private message.
 */
export type ChatMutationResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function sendChatMessage(args: {
  radarId: string;
  actor: ChatViewer;
  body: string;
}): Promise<ChatMutationResult<{ message: ChatMessageRow; access: ChatAccess }>> {
  const gate = await requireChatAccess(args.radarId, args.actor);
  if (!gate.ok) return gate;

  const message = await db.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: { radarId: args.radarId, authorId: args.actor.id, body: args.body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, handle: true, image: true } },
      },
    });

    // Sending is reading. Advancing the marker here means your own message can
    // never bold your own tab, in this browser or any other.
    await tx.chatRead.upsert({
      where: { radarId_userId: { radarId: args.radarId, userId: args.actor.id } },
      update: { readAt: created.createdAt },
      create: {
        radarId: args.radarId,
        userId: args.actor.id,
        readAt: created.createdAt,
      },
    });

    return created;
  });

  return { ok: true, message, access: gate.access };
}

export async function deleteChatMessage(args: {
  messageId: string;
  actor: ChatViewer;
}): Promise<ChatMutationResult<{ radarId: string; access: ChatAccess }>> {
  const message = await db.chatMessage.findUnique({
    where: { id: args.messageId },
    select: { id: true, radarId: true, authorId: true },
  });
  if (!message) return { ok: false, error: "That message is already gone." };

  // Membership first, ownership second: losing your role must lose you the
  // ability to reach into the conversation at all, including to redact.
  const gate = await requireChatAccess(message.radarId, args.actor);
  if (!gate.ok) return gate;

  if (message.authorId !== args.actor.id && !args.actor.isAdmin) {
    return { ok: false, error: "You can only delete your own messages." };
  }

  await db.chatMessage.delete({ where: { id: message.id } });
  return { ok: true, radarId: message.radarId, access: gate.access };
}

export async function markChatRead(args: {
  radarId: string;
  actor: ChatViewer;
}): Promise<ChatMutationResult<object>> {
  const gate = await requireChatAccess(args.radarId, args.actor);
  if (!gate.ok) return gate;

  const readAt = new Date();
  await db.chatRead.upsert({
    where: { radarId_userId: { radarId: args.radarId, userId: args.actor.id } },
    update: { readAt },
    create: { radarId: args.radarId, userId: args.actor.id, readAt },
  });

  return { ok: true };
}

/** Re-export so callers do not have to know which file the message lives in. */
export { NO_ACCESS };
