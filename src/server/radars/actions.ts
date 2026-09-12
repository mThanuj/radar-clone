"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  Classification,
  RadarState,
  RadarSubstate,
  Reproducibility,
} from "@/generated/prisma/enums";
import { scheduleEmailDispatch } from "@/server/email/outbox";
import { schedulePush } from "@/server/realtime/notify";
import { actionError as fail, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/guards";
import {
  bulkUpdate,
  closeAsDuplicate,
  createRadar,
  updateRadar,
} from "@/server/radars/mutations";

/**
 * Server actions do exactly four things: authenticate, validate, delegate to
 * the mutation, revalidate. Business logic lives in mutations.ts so it stays
 * testable without a request context.
 */

// Spelled out rather than derived from DESCRIPTION_SECTIONS: building the
// shape programmatically erases the literal key types, and the callers of
// these actions want real field names.
const prose = z.string().max(20_000).nullish();
const descriptionShape = {
  stepsToReproduce: prose,
  expectedResults: prose,
  actualResults: prose,
  versionBuild: prose,
  configuration: prose,
  notes: prose,
};

const createSchema = z.object({
  title: z.string().trim().min(3).max(300),
  summary: z.string().trim().min(1).max(20_000),
  ...descriptionShape,
  classification: z.enum(Classification),
  reproducibility: z.enum(Reproducibility).optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  componentId: z.string().min(1),
  componentVersionId: z.string().nullish(),
  milestoneId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  isRegression: z.boolean().optional(),
  dueDate: z.coerce.date().nullish(),
  keywordIds: z.array(z.string()).optional(),
});

export async function createRadarAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ number: number }>> {
  try {
    const user = await requireUser();
    const parsed = createSchema.parse(input);
    const radar = await createRadar({ actorId: user.id, input: parsed });
    schedulePush(radar.recipients);
    revalidatePath("/radars");
    revalidatePath("/timeline");
    scheduleEmailDispatch();
    return { ok: true, data: { number: radar.number } };
  } catch (error) {
    return fail(error);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  summary: z.string().trim().min(1).max(20_000).optional(),
  ...descriptionShape,
  classification: z.enum(Classification).optional(),
  reproducibility: z.enum(Reproducibility).optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  state: z.enum(RadarState).optional(),
  substate: z.enum(RadarSubstate).optional(),
  componentId: z.string().min(1).optional(),
  componentVersionId: z.string().nullish(),
  milestoneId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  isRegression: z.boolean().optional(),
  fixedInBuild: z.string().max(200).nullish(),
  dueDate: z.coerce.date().nullish(),
  keywordIds: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
  expectedVersion: z.coerce.number().int().optional(),
  note: z.string().max(2000).optional(),
  patch: patchSchema,
});

export async function updateRadarAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { radarId, number, expectedVersion, patch, note } =
      updateSchema.parse(input);
    const updated = await updateRadar({
      radarId,
      actorId: user.id,
      expectedVersion,
      patch,
      note,
    });
    schedulePush(updated.recipients);
    revalidatePath(`/radars/${number}`);
    revalidatePath("/radars");
    revalidatePath("/board");
    revalidatePath("/timeline");
    scheduleEmailDispatch();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const duplicateSchema = z.object({
  radarId: z.string().min(1),
  number: z.coerce.number().int(),
  duplicateOfNumber: z.coerce.number().int(),
  expectedVersion: z.coerce.number().int().optional(),
  note: z.string().max(2000).optional(),
});

export async function closeAsDuplicateAction(
  input: z.input<typeof duplicateSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = duplicateSchema.parse(input);
    const closed = await closeAsDuplicate({ ...parsed, actorId: user.id });
    schedulePush(closed.recipients);
    revalidatePath(`/radars/${parsed.number}`);
    revalidatePath(`/radars/${parsed.duplicateOfNumber}`);
    revalidatePath("/radars");
    revalidatePath("/timeline");
    scheduleEmailDispatch();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const bulkSchema = z.object({
  radarIds: z.array(z.string().min(1)).min(1).max(200),
  patch: patchSchema,
});

export async function bulkUpdateAction(
  input: z.input<typeof bulkSchema>,
): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireUser();
    const { radarIds, patch } = bulkSchema.parse(input);
    const { count, recipients } = await bulkUpdate({
      radarIds,
      actorId: user.id,
      patch,
    });
    schedulePush(recipients);
    revalidatePath("/radars");
    revalidatePath("/board");
    revalidatePath("/timeline");
    scheduleEmailDispatch();
    return { ok: true, data: { count } };
  } catch (error) {
    return fail(error);
  }
}
