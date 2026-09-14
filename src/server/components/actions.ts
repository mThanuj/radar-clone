"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().nullish(),
  description: z.string().max(500).nullish(),
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
        description: parsed.description ?? null,
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
  description: z.string().max(500).nullish(),
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
          description: parsed.description ?? null,
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

const keywordSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes."),
  label: z.string().trim().min(1).max(60).optional(),
  color: z.string().max(20).nullish(),
});

export async function createKeywordAction(
  input: z.input<typeof keywordSchema>,
): Promise<ActionResult> {
  try {
    await requireUser();
    const parsed = keywordSchema.parse(input);
    await db.keyword.upsert({
      where: { name: parsed.name },
      update: { label: parsed.label ?? parsed.name, color: parsed.color ?? null },
      create: {
        name: parsed.name,
        label: parsed.label ?? parsed.name,
        color: parsed.color ?? null,
      },
    });
    revalidatePath("/settings/keywords");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteKeywordAction(
  input: { id: string },
): Promise<ActionResult> {
  try {
    await requireUser();
    await db.keyword.delete({ where: { id: input.id } });
    revalidatePath("/settings/keywords");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
