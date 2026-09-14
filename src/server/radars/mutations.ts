import "server-only";
import type {
  Classification,
  NotificationReason,
  RadarState,
  RadarSubstate,
  Reproducibility,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  assertTransition,
  DEFAULT_SUBSTATE,
  resolveSubstate,
} from "@/lib/radar/state-machine";
import { withAuditResult } from "@/server/context";
import { radarAudience } from "@/server/notifications/fanout";
import {
  diffRadar,
  labelChanges,
  recordActivity,
  type FieldChangeInput,
} from "@/server/activity/record";
import type { Tx } from "@/server/tx";

export class StaleRadarError extends Error {
  constructor() {
    super("This radar changed while you were editing it. Reload and try again.");
    this.name = "StaleRadarError";
  }
}

export class RadarNotFoundError extends Error {
  constructor(ref: string | number) {
    super(`Radar ${ref} does not exist.`);
    this.name = "RadarNotFoundError";
  }
}

export type RadarPatch = Partial<{
  title: string;
  summary: string;
  stepsToReproduce: string | null;
  expectedResults: string | null;
  actualResults: string | null;
  versionBuild: string | null;
  configuration: string | null;
  notes: string | null;
  classification: Classification;
  reproducibility: Reproducibility;
  priority: number;
  state: RadarState;
  substate: RadarSubstate;
  componentId: string;
  milestoneId: string | null;
  assigneeId: string | null;
  isRegression: boolean;
  fixedInBuild: string | null;
  dueDate: Date | null;
  /**
   * Written only by closeAsDuplicate(). Never expose this in an action
   * schema — the FK and the DUPLICATE_OF edge must move together.
   */
  duplicateOfId: string | null;
  /** Full replacement set; the diff against current rows is computed here. */
  keywordIds: string[];
}>;

const MUTABLE_COLUMNS = [
  "title",
  "summary",
  "stepsToReproduce",
  "expectedResults",
  "actualResults",
  "versionBuild",
  "configuration",
  "notes",
  "classification",
  "reproducibility",
  "priority",
  "state",
  "substate",
  "componentId",
  "milestoneId",
  "assigneeId",
  "isRegression",
  "fixedInBuild",
  "dueDate",
  "duplicateOfId",
] as const;

type MutableColumn = (typeof MUTABLE_COLUMNS)[number];

const sameValue = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;

/**
 * Replace the keyword set, returning audit entries for what actually moved.
 */
async function applyKeywords(
  tx: Tx,
  radarId: string,
  actorId: string,
  keywordIds: string[],
): Promise<FieldChangeInput[]> {
  const existing = await tx.radarKeyword.findMany({
    where: { radarId },
    select: { keywordId: true },
  });
  const before = new Set(existing.map((k) => k.keywordId));
  const after = new Set(keywordIds);

  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  if (!added.length && !removed.length) return [];

  if (removed.length) {
    await tx.radarKeyword.deleteMany({
      where: { radarId, keywordId: { in: removed } },
    });
  }
  if (added.length) {
    await tx.radarKeyword.createMany({
      data: added.map((keywordId) => ({ radarId, keywordId, addedById: actorId })),
      skipDuplicates: true,
    });
  }

  return [
    ...added.map((id) => ({ field: "keyword", toValue: id })),
    ...removed.map((id) => ({ field: "keyword", fromValue: id })),
  ];
}

/**
 * The core update. Everything — inline edits, the detail form, board drags,
 * bulk edit, closing as duplicate — lands here, inside a transaction, so the
 * activity trail cannot diverge from the data.
 */
export async function applyUpdate(
  tx: Tx,
  args: {
    radarId: string;
    actorId: string;
    /** Omit for bulk edits, which are last-write-wins by nature. */
    expectedVersion?: number;
    patch: RadarPatch;
    note?: string;
    extraChanges?: FieldChangeInput[];
  },
) {
  const before = await tx.radar.findUnique({ where: { id: args.radarId } });
  if (!before) throw new RadarNotFoundError(args.radarId);

  // 1. Drop no-ops, so an "empty" save writes nothing at all.
  const data: Record<string, unknown> = {};
  for (const column of MUTABLE_COLUMNS) {
    const next = args.patch[column as MutableColumn];
    if (next === undefined) continue;
    if (sameValue(next, (before as Record<string, unknown>)[column])) continue;
    data[column] = next;
  }

  // 2. State machine. A caller may move state without naming a substate.
  const movingState = data.state !== undefined || data.substate !== undefined;
  if (movingState) {
    const nextState = (data.state as RadarState) ?? before.state;
    const nextSubstate = resolveSubstate(
      nextState,
      data.substate as RadarSubstate | undefined,
      before.substate,
    );
    assertTransition(before, { state: nextState, substate: nextSubstate });

    data.state = nextState;
    data.substate = nextSubstate;
    if (nextState !== before.state || nextSubstate !== before.substate) {
      data.stateChangedAt = new Date();
    }
    // resolvedAt tracks entering and leaving CLOSED.
    if (nextState === "CLOSED" && before.state !== "CLOSED") {
      data.resolvedAt = new Date();
    } else if (nextState !== "CLOSED" && before.state === "CLOSED") {
      data.resolvedAt = null;
    }
    // Re-check for no-ops introduced by the substate carry-over.
    if (data.state === before.state) delete data.state;
    if (data.substate === before.substate) delete data.substate;
  }

  const keywordChanges =
    args.patch.keywordIds !== undefined
      ? await applyKeywords(tx, args.radarId, args.actorId, args.patch.keywordIds)
      : [];

  const hasColumnChanges = Object.keys(data).length > 0;
  const extra = args.extraChanges ?? [];

  if (!hasColumnChanges && !keywordChanges.length && !extra.length) {
    return before; // nothing happened; do not write an empty event
  }

  let after = before;
  if (hasColumnChanges) {
    // 3. Optimistic concurrency. updateMany (not update) so a lost race is a
    // clean zero-row result rather than an exception to pattern-match.
    const { count } = await tx.radar.updateMany({
      where:
        args.expectedVersion === undefined
          ? { id: args.radarId }
          : { id: args.radarId, version: args.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) throw new StaleRadarError();

    after = (await tx.radar.findUnique({ where: { id: args.radarId } }))!;
  }

  // 4. Assignment implies watching — the standard Radar courtesy.
  if (data.assigneeId) {
    await tx.radarSubscriber.upsert({
      where: {
        radarId_userId_role: {
          radarId: args.radarId,
          userId: data.assigneeId as string,
          role: "WATCHER",
        },
      },
      update: {},
      create: {
        radarId: args.radarId,
        userId: data.assigneeId as string,
        role: "WATCHER",
        addedById: args.actorId,
      },
    });
  }

  const changes = await labelChanges(tx, [
    ...diffRadar(before, after),
    ...keywordChanges,
    ...extra,
  ]);

  await recordActivity(tx, {
    radarId: args.radarId,
    actorId: args.actorId,
    kind: "FIELDS_CHANGED",
    changes,
    note: args.note,
    direct: data.assigneeId
      ? [{ userId: data.assigneeId as string, reason: "ASSIGNED" as const }]
      : undefined,
  });

  return after;
}

export async function updateRadar(args: {
  radarId: string;
  actorId: string;
  expectedVersion?: number;
  patch: RadarPatch;
  note?: string;
}) {
  // recipients ride along so the action can push to them after commit without
  // every mutation having to thread the list back by hand.
  const { value, recipients } = await withAuditResult(args.actorId, () =>
    db.$transaction((tx) => applyUpdate(tx as Tx, args)),
  );
  return Object.assign(value, { recipients });
}

export async function bulkUpdate(args: {
  radarIds: string[];
  actorId: string;
  patch: RadarPatch;
}) {
  const { value, recipients } = await withAuditResult(args.actorId, () =>
    db.$transaction(async (tx) => {
      for (const radarId of args.radarIds) {
        await applyUpdate(tx as Tx, {
          radarId,
          actorId: args.actorId,
          patch: args.patch,
        });
      }
      return args.radarIds.length;
    }),
  );
  return { count: value, recipients };
}

export type CreateRadarInput = {
  title: string;
  summary: string;
  stepsToReproduce?: string | null;
  expectedResults?: string | null;
  actualResults?: string | null;
  versionBuild?: string | null;
  configuration?: string | null;
  notes?: string | null;
  classification: Classification;
  reproducibility?: Reproducibility;
  priority?: number;
  componentId: string;
  milestoneId?: string | null;
  assigneeId?: string | null;
  isRegression?: boolean;
  dueDate?: Date | null;
  keywordIds?: string[];
};

export async function createRadar(args: {
  actorId: string;
  input: CreateRadarInput;
}) {
  const { value, recipients } = await withAuditResult(args.actorId, () =>
    db.$transaction(async (tx) => {
      const component = await tx.component.findUnique({
        where: { id: args.input.componentId },
        select: { id: true, defaultAssigneeId: true },
      });
      if (!component) throw new Error("That component does not exist.");

      const assigneeId =
        args.input.assigneeId ?? component.defaultAssigneeId ?? null;

      const radar = await tx.radar.create({
        data: {
          title: args.input.title,
          summary: args.input.summary,
          stepsToReproduce: args.input.stepsToReproduce ?? null,
          expectedResults: args.input.expectedResults ?? null,
          actualResults: args.input.actualResults ?? null,
          versionBuild: args.input.versionBuild ?? null,
          configuration: args.input.configuration ?? null,
          notes: args.input.notes ?? null,
          classification: args.input.classification,
          reproducibility: args.input.reproducibility ?? "NOT_APPLICABLE",
          priority: args.input.priority ?? 3,
          state: "ANALYZE",
          substate: DEFAULT_SUBSTATE.ANALYZE,
          componentId: args.input.componentId,
          milestoneId: args.input.milestoneId ?? null,
          originatorId: args.actorId,
          assigneeId,
          isRegression: args.input.isRegression ?? false,
          dueDate: args.input.dueDate ?? null,
          keywords: args.input.keywordIds?.length
            ? {
                create: args.input.keywordIds.map((keywordId) => ({
                  keywordId,
                  addedById: args.actorId,
                })),
              }
            : undefined,
        },
        select: { id: true, number: true, title: true },
      });

      // The originator always watches; so does whoever it lands on.
      const watchers = new Set([args.actorId, assigneeId].filter(Boolean) as string[]);
      await tx.radarSubscriber.createMany({
        data: [...watchers].map((userId) => ({
          radarId: radar.id,
          userId,
          role: "WATCHER" as const,
          addedById: args.actorId,
        })),
        skipDuplicates: true,
      });

      // Whoever owns the component wants to know something landed in it,
      // unless they filed it or it was already assigned to them.
      const direct: { userId: string; reason: NotificationReason }[] = [];
      if (assigneeId) direct.push({ userId: assigneeId, reason: "ASSIGNED" });
      if (
        component.defaultAssigneeId &&
        component.defaultAssigneeId !== assigneeId &&
        component.defaultAssigneeId !== args.actorId
      ) {
        direct.push({
          userId: component.defaultAssigneeId,
          reason: "COMPONENT_FILED",
        });
      }

      await recordActivity(tx as Tx, {
        radarId: radar.id,
        actorId: args.actorId,
        kind: "RADAR_CREATED",
        direct,
      });

      return radar;
    }),
  );
  return Object.assign(value, { recipients });
}

/**
 * Closing as a duplicate writes both the denormalized FK and the
 * DUPLICATE_OF edge. This is the only function allowed to touch either, which
 * is what keeps them from drifting apart.
 */
export async function closeAsDuplicate(args: {
  radarId: string;
  actorId: string;
  duplicateOfNumber: number;
  expectedVersion?: number;
  note?: string;
}) {
  const { value, recipients } = await withAuditResult(args.actorId, () =>
    db.$transaction(async (tx) => {
      const canonical = await tx.radar.findUnique({
        where: { number: args.duplicateOfNumber },
        select: { id: true, number: true, title: true },
      });
      if (!canonical) throw new RadarNotFoundError(args.duplicateOfNumber);
      if (canonical.id === args.radarId) {
        throw new Error("A radar cannot be a duplicate of itself.");
      }

      await tx.radarRelation.upsert({
        where: {
          sourceId_targetId_type: {
            sourceId: args.radarId,
            targetId: canonical.id,
            type: "DUPLICATE_OF",
          },
        },
        update: {},
        create: {
          sourceId: args.radarId,
          targetId: canonical.id,
          type: "DUPLICATE_OF",
          createdById: args.actorId,
        },
      });

      const result = await applyUpdate(tx as Tx, {
        radarId: args.radarId,
        actorId: args.actorId,
        expectedVersion: args.expectedVersion,
        note: args.note,
        patch: {
          state: "CLOSED",
          substate: "DUPLICATE",
          duplicateOfId: canonical.id,
        },
      });

      // The canonical radar gained a duplicate; its followers care, and the
      // diff above only describes the radar being closed.
      const duplicate = await tx.radar.findUniqueOrThrow({
        where: { id: args.radarId },
        select: { number: true, title: true },
      });
      const audience = await radarAudience(tx as Tx, canonical.id);

      await recordActivity(tx as Tx, {
        radarId: canonical.id,
        actorId: args.actorId,
        kind: "FIELDS_CHANGED",
        changes: [
          {
            field: "duplicateOf",
            toValue: args.radarId,
            toLabel: `${duplicate.number} — ${duplicate.title}`,
          },
        ],
        direct: audience.map((userId) => ({
          userId,
          reason: "DUPLICATED" as const,
        })),
      });

      return result;
    }),
  );
  return Object.assign(value, { recipients });
}
