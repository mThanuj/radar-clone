"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { extractMentions, stripMarkdown } from "@/lib/markdown";
import { withAuditResult } from "@/server/context";
import { recordActivity } from "@/server/activity/record";
import { scheduleEmailDispatch } from "@/server/email/outbox";
import { requireUser } from "@/server/guards";
import { schedulePush } from "@/server/realtime/notify";
import type { Tx } from "@/server/tx";
import type { ActionResult } from "@/server/action-result";

const addSchema = z.object({
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
  body: z.string().trim().min(1).max(50_000),
});

export async function addCommentAction(
  input: z.input<typeof addSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { radarId, number, body } = addSchema.parse(input);

    const { recipients } = await withAuditResult(user.id, () =>
      db.$transaction(async (tx) => {
        const handles = extractMentions(body);
        const mentioned = handles.length
          ? await tx.user.findMany({
              where: { handle: { in: handles }, isActive: true },
              select: { id: true },
            })
          : [];

        const comment = await tx.comment.create({
          data: {
            radarId,
            authorId: user.id,
            body,
            bodyText: stripMarkdown(body),
          },
          select: { id: true },
        });

        // Commenting means you care: start watching unless already subscribed.
        await tx.radarSubscriber.upsert({
          where: {
            radarId_userId_role: { radarId, userId: user.id, role: "WATCHER" },
          },
          update: {},
          create: { radarId, userId: user.id, role: "WATCHER", addedById: user.id },
        });

        await recordActivity(tx as Tx, {
          radarId,
          actorId: user.id,
          kind: "COMMENT_ADDED",
          commentId: comment.id,
          commentExcerpt: body.slice(0, 400),
          direct: mentioned.map((m) => ({
            userId: m.id,
            reason: "MENTIONED" as const,
          })),
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    revalidatePath("/timeline");
    schedulePush(recipients);
    scheduleEmailDispatch();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add comment.",
    };
  }
}

const editSchema = z.object({
  commentId: z.string().min(1),
  number: z.coerce.number().int(),
  body: z.string().trim().min(1).max(50_000),
});

export async function editCommentAction(
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { commentId, number, body } = editSchema.parse(input);

    const existing = await db.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, radarId: true },
    });
    if (!existing) return { ok: false, error: "That comment is gone." };
    if (existing.authorId !== user.id) {
      return { ok: false, error: "You can only edit your own comments." };
    }

    const { recipients } = await withAuditResult(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.comment.update({
          where: { id: commentId },
          data: { body, bodyText: stripMarkdown(body), editedAt: new Date() },
        });
        await recordActivity(tx as Tx, {
          radarId: existing.radarId,
          actorId: user.id,
          kind: "COMMENT_EDITED",
          commentExcerpt: body.slice(0, 400),
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    schedulePush(recipients);
    scheduleEmailDispatch();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not edit comment.",
    };
  }
}

const deleteSchema = z.object({
  commentId: z.string().min(1),
  number: z.coerce.number().int(),
});

export async function deleteCommentAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { commentId, number } = deleteSchema.parse(input);

    const existing = await db.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, radarId: true },
    });
    if (!existing) return { ok: false, error: "That comment is gone." };
    if (existing.authorId !== user.id && !user.isAdmin) {
      return { ok: false, error: "You can only delete your own comments." };
    }

    // Soft delete: the activity trail has to survive.
    const { recipients } = await withAuditResult(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.comment.update({
          where: { id: commentId },
          data: { deletedAt: new Date() },
        });
        await recordActivity(tx as Tx, {
          radarId: existing.radarId,
          actorId: user.id,
          kind: "COMMENT_DELETED",
          notify: false,
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    schedulePush(recipients);
    scheduleEmailDispatch();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete comment.",
    };
  }
}
