"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().nullish(),
  defaultAssigneeId: z.string().nullish(),
});

export async function createComponentAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const parsed = createSchema.parse(input);

    if (parsed.name.includes("/")) {
      return { ok: false, error: "Component names cannot contain a slash." };
    }

    const parent = parsed.parentId
      ? await db.component.findUnique({
          where: { id: parsed.parentId },
          select: { path: true, depth: true },
        })
      : null;
    if (parsed.parentId && !parent) {
      return { ok: false, error: "That parent component no longer exists." };
    }

    const created = await db.component.create({
      data: {
        name: parsed.name,
        parentId: parsed.parentId ?? null,
        // Materialized path: subtree filters become a prefix scan.
        path: parent ? `${parent.path}/${parsed.name}` : parsed.name,
        depth: parent ? parent.depth + 1 : 0,
        defaultAssigneeId: parsed.defaultAssigneeId ?? null,
      },
      select: { id: true },
    });

    revalidatePath("/settings/components");
    revalidatePath("/components");
    return { ok: true, data: created };
  } catch (error) {
    return actionError(error);
  }
}

const renameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  defaultAssigneeId: z.string().nullish(),
  isActive: z.boolean().optional(),
});

export async function updateComponentAction(
  input: z.input<typeof renameSchema>,
): Promise<ActionResult> {
  try {
    await requireUser();
    const parsed = renameSchema.parse(input);
    if (parsed.name.includes("/")) {
      return { ok: false, error: "Component names cannot contain a slash." };
    }

    const current = await db.component.findUnique({
      where: { id: parsed.id },
      select: { path: true, name: true, parentId: true },
    });
    if (!current) return { ok: false, error: "That component no longer exists." };

    await db.$transaction(async (tx) => {
      const parent = current.parentId
        ? await tx.component.findUnique({
            where: { id: current.parentId },
            select: { path: true },
          })
        : null;
      const nextPath = parent ? `${parent.path}/${parsed.name}` : parsed.name;

      await tx.component.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          path: nextPath,
          defaultAssigneeId: parsed.defaultAssigneeId ?? null,
          ...(parsed.isActive === undefined ? {} : { isActive: parsed.isActive }),
        },
      });

      // A materialized path is only worth having if descendants follow along.
      if (nextPath !== current.path) {
        const descendants = await tx.component.findMany({
          where: { path: { startsWith: `${current.path}/` } },
          select: { id: true, path: true },
        });
        for (const d of descendants) {
          await tx.component.update({
            where: { id: d.id },
            data: { path: nextPath + d.path.slice(current.path.length) },
          });
        }
      }
    });

    revalidatePath("/settings/components");
    revalidatePath("/components");
    revalidatePath("/radars");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

