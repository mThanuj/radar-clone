"use server";

import { z } from "zod";
import { actionError, type ActionResult } from "@/server/action-result";
import { chatAccessFor } from "@/server/chat/access";
import {
  deleteChatMessage,
  markChatRead,
  sendChatMessage,
} from "@/server/chat/mutations";
import {
  getChatPage,
  getChatSince,
  type ChatMessageRow,
} from "@/server/chat/queries";
import { scheduleChatPush, scheduleChatRemovalPush } from "@/server/chat/publish";
import { requireUser } from "@/server/guards";

/**
 * Chat actions.
 *
 * Thin by design: every rule lives in access.ts and mutations.ts, which the
 * integration suite can drive without a request context. What is left here is
 * authenticate, validate, delegate, push.
 *
 * Note what is missing: no revalidatePath. It would re-render the whole radar
 * page — the feed, the sidebar, the relations panel — for one line of chat. The
 * panel is a client component fed by these return values and the realtime
 * stream, so it never needs a server re-render.
 */
export type ChatMessageWire = {
  id: string;
  body: string;
  /** ISO, so one type covers both this and the realtime frame. */
  createdAt: string;
  author: { id: string; name: string; handle: string; image: string | null };
};

const toWire = (row: ChatMessageRow): ChatMessageWire => ({
  id: row.id,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
  author: row.author,
});

const sendSchema = z.object({
  radarId: z.string().min(1),
  // Chat, not essays — comments allow 50k. A small ceiling also caps the
  // realtime payload, since the body rides in the frame.
  body: z.string().trim().min(1).max(4_000),
});

export async function sendChatMessageAction(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult<{ message: ChatMessageWire }>> {
  try {
    const user = await requireUser();
    const { radarId, body } = sendSchema.parse(input);

    const result = await sendChatMessage({ radarId, actor: user, body });
    if (!result.ok) return result;

    scheduleChatPush({
      memberIds: result.access.memberIds,
      radarId,
      radarNumber: result.access.radarNumber,
      message: result.message,
    });

    return { ok: true, data: { message: toWire(result.message) } };
  } catch (error) {
    return actionError(error);
  }
}

const deleteSchema = z.object({ messageId: z.string().min(1) });

export async function deleteChatMessageAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { messageId } = deleteSchema.parse(input);

    const result = await deleteChatMessage({ messageId, actor: user });
    if (!result.ok) return result;

    scheduleChatRemovalPush({
      memberIds: result.access.memberIds,
      radarId: result.radarId,
      radarNumber: result.access.radarNumber,
      messageId,
    });

    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const radarSchema = z.object({ radarId: z.string().min(1) });

export async function markChatReadAction(
  input: z.input<typeof radarSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { radarId } = radarSchema.parse(input);
    return await markChatRead({ radarId, actor: user });
  } catch (error) {
    return actionError(error);
  }
}

const olderSchema = z.object({
  radarId: z.string().min(1),
  cursor: z.string().min(1),
});

export async function loadOlderChatAction(
  input: z.input<typeof olderSchema>,
): Promise<ActionResult<{ messages: ChatMessageWire[]; olderCursor: string | null }>> {
  try {
    const user = await requireUser();
    const { radarId, cursor } = olderSchema.parse(input);

    const access = await chatAccessFor(radarId, user);
    if (!access) return { ok: false, error: "You're not on this radar's chat." };

    const page = await getChatPage(access, { cursor });
    return {
      ok: true,
      data: { messages: page.messages.map(toWire), olderCursor: page.olderCursor },
    };
  } catch (error) {
    return actionError(error);
  }
}

const sinceSchema = z.object({
  radarId: z.string().min(1),
  since: z.coerce.date(),
});

/** The degraded-mode poll: what arrived while the stream was down. */
export async function loadChatSinceAction(
  input: z.input<typeof sinceSchema>,
): Promise<ActionResult<{ messages: ChatMessageWire[] }>> {
  try {
    const user = await requireUser();
    const { radarId, since } = sinceSchema.parse(input);

    const access = await chatAccessFor(radarId, user);
    if (!access) return { ok: false, error: "You're not on this radar's chat." };

    const messages = await getChatSince(access, since);
    return { ok: true, data: { messages: messages.map(toWire) } };
  } catch (error) {
    return actionError(error);
  }
}
