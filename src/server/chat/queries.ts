import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ChatAccess } from "@/server/chat/access";
import type { Tx } from "@/server/tx";

/**
 * Reading a radar's chat.
 *
 * Every function here takes a ChatAccess rather than a radarId: the object can
 * only come from src/server/chat/access.ts, so it is not possible to write a
 * chat read that forgot to authorize itself.
 */
export const CHAT_PAGE_SIZE = 50;

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, handle: true, image: true } },
} satisfies Prisma.ChatMessageSelect;

export type ChatMessageRow = Prisma.ChatMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

/**
 * One page, oldest-first for display but fetched newest-first.
 *
 * A chat opens at the bottom and pages *upward*, which is why the cursor is
 * called `olderCursor` and not `nextCursor`. Otherwise this is getTimeline's
 * take+1 / cursor / skip:1 shape — unlike getFeed, which caps at 200 rows with
 * no pagination at all, and would quietly start hiding the beginning of a busy
 * conversation.
 */
export async function getChatPage(
  access: ChatAccess,
  args: { cursor?: string; take?: number } = {},
  client: Tx = db,
): Promise<{ messages: ChatMessageRow[]; olderCursor: string | null }> {
  const take = args.take ?? CHAT_PAGE_SIZE;

  const rows = await client.chatMessage.findMany({
    where: { radarId: access.radarId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: MESSAGE_SELECT,
  });

  const hasOlder = rows.length > take;
  const page = hasOlder ? rows.slice(0, take) : rows;

  return {
    messages: page.reverse(),
    olderCursor: hasOlder ? page[0].id : null,
  };
}

/** Everything written since `after`, oldest-first. The degraded-mode poll. */
export async function getChatSince(
  access: ChatAccess,
  after: Date,
  client: Tx = db,
): Promise<ChatMessageRow[]> {
  return client.chatMessage.findMany({
    where: { radarId: access.radarId, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: CHAT_PAGE_SIZE,
    select: MESSAGE_SELECT,
  });
}

/**
 * How many messages this person has not seen.
 *
 * `authorId: { not: userId }` is belt-and-braces: sending advances your own
 * marker in the same transaction, so your own message is already excluded by
 * the timestamp — but createdAt is millisecond-resolution and two messages can
 * land inside one.
 */
export async function getChatUnreadCount(
  access: ChatAccess,
  userId: string,
  client: Tx = db,
): Promise<number> {
  const marker = await client.chatRead.findUnique({
    where: { radarId_userId: { radarId: access.radarId, userId } },
    select: { readAt: true },
  });

  return client.chatMessage.count({
    where: {
      radarId: access.radarId,
      authorId: { not: userId },
      ...(marker ? { createdAt: { gt: marker.readAt } } : {}),
    },
  });
}
