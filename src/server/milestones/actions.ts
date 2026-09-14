"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MilestoneStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const schema = z.object({
  id: z.string().nullish(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).nullish(),
  componentId: z.string().nullish(),
  status: z.enum(MilestoneStatus).optional(),
  targetDate: z.coerce.date().nullish(),
});

export async function upsertMilestoneAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const parsed = schema.parse(input);

    const data = {
      name: parsed.name,
      description: parsed.description ?? null,
      componentId: parsed.componentId ?? null,
      status: parsed.status ?? "PLANNED",
      targetDate: parsed.targetDate ?? null,
    };

    const saved = parsed.id
      ? await db.milestone.update({
          where: { id: parsed.id },
          data,
          select: { id: true },
        })
      : await db.milestone.create({ data, select: { id: true } });

    revalidatePath("/milestones");
    revalidatePath("/settings/milestones");
    return { ok: true, data: saved };
  } catch (error) {
    return actionError(error);
  }
}
