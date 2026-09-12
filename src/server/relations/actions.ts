"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RelationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  isSymmetric,
  normalizeSymmetric,
  RELATION_META,
  wouldCreateCycle,
} from "@/lib/radar/relations";
import { actionError, type ActionResult } from "@/server/action-result";
import { recordActivity } from "@/server/activity/record";
import { withAudit } from "@/server/context";
import { requireUser } from "@/server/guards";
import type { Tx } from "@/server/tx";

const addSchema = z.object({
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
  targetNumber: z.coerce.number().int(),
  type: z.enum(RelationType),
  note: z.string().max(500).nullish(),
});

/** Hierarchical/ordering edges must stay acyclic or every rollup hangs. */
const ACYCLIC: RelationType[] = ["PARENT_OF", "BLOCKS", "DUPLICATE_OF"];

export async function addRelationAction(
  input: z.input<typeof addSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { radarId, number, targetNumber, type, note } = addSchema.parse(input);

    const target = await db.radar.findUnique({
      where: { number: targetNumber },
      select: { id: true, number: true, title: true },
    });
    if (!target) return { ok: false, error: `Radar ${targetNumber} does not exist.` };
    if (target.id === radarId) {
      return { ok: false, error: "A radar cannot relate to itself." };
    }

    const { sourceId, targetId } = normalizeSymmetric(radarId, target.id, type);

    if (ACYCLIC.includes(type)) {
      const cyclic = await wouldCreateCycle(targetId, sourceId, async (id) => {
        const rows = await db.radarRelation.findMany({
          where: { targetId: id, type },
          select: { sourceId: true },
        });
        return rows.map((r) => r.sourceId);
      });
      if (cyclic) {
        return {
          ok: false,
          error: `That would create a ${RELATION_META[type].forward.toLowerCase()} cycle.`,
        };
      }
    }

    const existing = await db.radarRelation.findUnique({
      where: { sourceId_targetId_type: { sourceId, targetId, type } },
      select: { id: true },
    });
    if (existing) return { ok: false, error: "That relationship already exists." };

    await withAudit(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.radarRelation.create({
          data: { sourceId, targetId, type, note: note ?? null, createdById: user.id },
        });
        // Record it on the radar the user is looking at.
        await recordActivity(tx as Tx, {
          radarId,
          actorId: user.id,
          kind: "RELATION_ADDED",
          changes: [
            {
              field: `relation.${type}`,
              toValue: target.id,
              toLabel: `${target.number} — ${target.title}`,
            },
          ],
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    revalidatePath(`/radars/${targetNumber}`);
    revalidatePath("/timeline");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const removeSchema = z.object({
  relationId: z.string().min(1),
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
});

export async function removeRelationAction(
  input: z.input<typeof removeSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { relationId, radarId, number } = removeSchema.parse(input);

    const relation = await db.radarRelation.findUnique({
      where: { id: relationId },
      select: {
        type: true,
        sourceId: true,
        targetId: true,
        source: { select: { number: true, title: true } },
        target: { select: { number: true, title: true } },
      },
    });
    if (!relation) return { ok: false, error: "That relationship is already gone." };

    const other =
      relation.sourceId === radarId ? relation.target : relation.source;

    await withAudit(user.id, () =>
      db.$transaction(async (tx) => {
        await tx.radarRelation.delete({ where: { id: relationId } });
        await recordActivity(tx as Tx, {
          radarId,
          actorId: user.id,
          kind: "RELATION_REMOVED",
          changes: [
            {
              field: `relation.${relation.type}`,
              fromValue: relation.sourceId === radarId ? relation.targetId : relation.sourceId,
              fromLabel: `${other.number} — ${other.title}`,
            },
          ],
        });
      }),
    );

    revalidatePath(`/radars/${number}`);
    revalidatePath("/timeline");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Exposed for the relation picker so it can label the inverse direction. */
export async function relationOptionsAction() {
  return Object.entries(RELATION_META).map(([value, meta]) => ({
    value,
    label: meta.forward,
    inverse: meta.inverse,
    symmetric: isSymmetric(value as RelationType),
  }));
}
