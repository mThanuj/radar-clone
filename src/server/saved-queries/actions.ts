"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseSearchParams, toSearchParams } from "@/lib/search/url";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const saveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  params: z.string().max(4000),
  description: z.string().max(500).nullish(),
  isPinned: z.boolean().optional(),
  shared: z.boolean().optional(),
});

export async function saveQueryAction(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = saveSchema.parse(input);

    // Re-canonicalize before storing so two identical searches saved from
    // different entry points produce the same string.
    const { query } = parseSearchParams(new URLSearchParams(parsed.params));
    const params = toSearchParams(query).toString();

    const saved = await db.savedQuery.upsert({
      where: { ownerId_name: { ownerId: user.id, name: parsed.name } },
      update: {
        params,
        description: parsed.description ?? null,
        isPinned: parsed.isPinned ?? false,
        visibility: parsed.shared ? "SHARED" : "PRIVATE",
      },
      create: {
        ownerId: user.id,
        name: parsed.name,
        params,
        description: parsed.description ?? null,
        isPinned: parsed.isPinned ?? false,
        visibility: parsed.shared ? "SHARED" : "PRIVATE",
        sortOrder: 100,
      },
      select: { id: true },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return actionError(error);
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteSavedQueryAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { id } = idSchema.parse(input);
    const existing = await db.savedQuery.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing) return { ok: false, error: "Already deleted." };
    if (existing.ownerId !== user.id) {
      return { ok: false, error: "That query belongs to someone else." };
    }
    await db.savedQuery.delete({ where: { id } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const pinSchema = z.object({ id: z.string().min(1), isPinned: z.boolean() });

export async function togglePinAction(
  input: z.input<typeof pinSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { id, isPinned } = pinSchema.parse(input);
    const existing = await db.savedQuery.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (existing?.ownerId !== user.id) {
      return { ok: false, error: "That query belongs to someone else." };
    }
    await db.savedQuery.update({ where: { id }, data: { isPinned } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
