"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  jobTitle: z.string().max(120).nullish(),
  handle: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Lowercase letters, digits, dot, dash, underscore."),
});

export async function updateProfileAction(
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = schema.parse(input);

    if (parsed.handle !== user.handle) {
      const taken = await db.user.findUnique({
        where: { handle: parsed.handle },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        return { ok: false, error: "That handle is already taken." };
      }
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        name: parsed.name,
        jobTitle: parsed.jobTitle ?? null,
        handle: parsed.handle,
      },
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
