"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotificationCategory } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { actionError, type ActionResult } from "@/server/action-result";
import { renderEmail } from "@/server/email/templates";
import { fromAddress, getTransport, isLiveMail } from "@/server/email/transport";
import { unsubscribeUrl } from "@/server/email/unsubscribe";
import { requireUser } from "@/server/guards";

const readSchema = z.object({ id: z.string().min(1), read: z.boolean() });

export async function setNotificationReadAction(
  input: z.input<typeof readSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { id, read } = readSchema.parse(input);
    // Scoped by recipientId so one user can't mark another's notifications.
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

/** Backs the bell popover. */
export async function recentNotificationsAction(limit = 12) {
  const user = await requireUser();
  const rows = await db.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      reason: true,
      readAt: true,
      createdAt: true,
      radar: { select: { number: true, title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason as string,
    readAt: row.readAt,
    createdAt: row.createdAt,
    radarNumber: row.radar.number,
    radarTitle: row.radar.title,
  }));
}

const prefSchema = z.object({
  category: z.enum(NotificationCategory),
  inApp: z.boolean(),
  email: z.boolean(),
});

export async function setNotificationPreferenceAction(
  input: z.input<typeof prefSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { category, inApp, email } = prefSchema.parse(input);

    await db.notificationPreference.upsert({
      where: { userId_category: { userId: user.id, category } },
      update: { inApp, email },
      create: { userId: user.id, category, inApp, email },
    });

    revalidatePath("/settings/notifications");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setEmailEnabledAction(input: {
  enabled: boolean;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db.user.update({
      where: { id: user.id },
      data: { emailEnabled: Boolean(input.enabled) },
    });
    revalidatePath("/settings/notifications");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Sends straight through the transport rather than via the outbox: the point
 * is to prove SMTP works right now, so queueing it would hide the failure this
 * button exists to surface.
 */
export async function sendTestEmailAction(): Promise<ActionResult<{ live: boolean }>> {
  try {
    const user = await requireUser();

    const rendered = renderEmail({
      reason: "ASSIGNED",
      radar: { number: 100000000, title: "Test notification" },
      actorName: "Radar",
      changes: [{ field: "assigneeId", fromLabel: "Nobody", toLabel: user.name }],
      commentExcerpt: null,
      radarUrl: appUrl("/radars"),
      settingsUrl: appUrl("/settings/notifications"),
      unsubscribeUrl: unsubscribeUrl(user.id, "ASSIGNMENT"),
    });

    await getTransport().sendMail({
      from: fromAddress(),
      to: user.email,
      subject: `[test] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
    });

    return { ok: true, data: { live: isLiveMail() } };
  } catch (error) {
    return actionError(error);
  }
}
