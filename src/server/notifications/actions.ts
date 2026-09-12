"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const readSchema = z.object({ id: z.string().min(1), read: z.boolean() });

export async function setNotificationReadAction(
  input: z.input<typeof readSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { id, read } = readSchema.parse(input);
    await db.notification.updateMany({
      where: { id, recipientId: user.id },
      data: { readAt: read ? new Date() : null },
    });
    revalidatePath("/inbox");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function markAllReadAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/inbox");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
