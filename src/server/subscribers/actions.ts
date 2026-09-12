"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SubscriberRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { recordActivity } from "@/server/activity/record";
import { withAudit } from "@/server/context";
import { requireUser } from "@/server/guards";
import type { Tx } from "@/server/tx";

const addSchema = z.object({
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
  userId: z.string().min(1),
  role: z.enum(SubscriberRole),
});

export async function addSubscriberAction(
  input: z.input<typeof addSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    const { radarId, number, userId, role } = addSchema.parse(input);

    const person = await db.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!person) return { ok: false, error: "No such person." };

    await withAudit(actor.id, () =>
      db.$transaction(async (tx) => {
        await tx.radarSubscriber.upsert({
          where: { radarId_userId_role: { radarId, userId, role } },
          update: {},
          create: { radarId, userId, role, addedById: actor.id },
        });
        await recordActivity(tx as Tx, {
          radarId,
          actorId: actor.id,
          kind: "SUBSCRIBER_ADDED",
          changes: [
            {
              field: role === "CC" ? "cc" : "watcher",
              toValue: userId,
              toLabel: person.name,
            },
          ],
          direct:
            role === "CC" ? [{ userId, reason: "CC_ADDED" as const }] : undefined,
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const removeSchema = z.object({
  subscriberId: z.string().min(1),
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
});

export async function removeSubscriberAction(
  input: z.input<typeof removeSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    const { subscriberId, radarId, number } = removeSchema.parse(input);

    const row = await db.radarSubscriber.findUnique({
      where: { id: subscriberId },
      select: { role: true, userId: true, user: { select: { name: true } } },
    });
    if (!row) return { ok: false, error: "Already removed." };

    await withAudit(actor.id, () =>
      db.$transaction(async (tx) => {
        await tx.radarSubscriber.delete({ where: { id: subscriberId } });
        await recordActivity(tx as Tx, {
          radarId,
          actorId: actor.id,
          kind: "SUBSCRIBER_REMOVED",
          notify: false,
          changes: [
            {
              field: row.role === "CC" ? "cc" : "watcher",
              fromValue: row.userId,
              fromLabel: row.user.name,
            },
          ],
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const muteSchema = z.object({
  subscriberId: z.string().min(1),
  number: z.coerce.number().int(),
  muted: z.boolean(),
});

/** Muting is a personal preference, not radar history — no activity event. */
export async function setSubscriptionMutedAction(
  input: z.input<typeof muteSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    const { subscriberId, number, muted } = muteSchema.parse(input);

    const row = await db.radarSubscriber.findUnique({
      where: { id: subscriberId },
      select: { userId: true },
    });
    if (!row) return { ok: false, error: "Subscription not found." };
    if (row.userId !== actor.id) {
      return { ok: false, error: "You can only mute your own subscriptions." };
    }

    await db.radarSubscriber.update({
      where: { id: subscriberId },
      data: { muted },
    });

    revalidatePath(`/radars/${number}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
