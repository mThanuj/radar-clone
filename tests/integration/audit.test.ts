import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { UnauditedWriteError } from "@/server/context";
import {
  StaleRadarError,
  createRadar,
  updateRadar,
  closeAsDuplicate,
  type RadarPatch,
} from "@/server/radars/mutations";
import { createFixtures, destroyFixtures } from "./fixtures";

/** Audit field key -> the Radar column it describes. */
const FIELD_TO_COLUMN: Record<string, string> = {
  title: "title",
  summary: "summary",
  stepsToReproduce: "stepsToReproduce",
  notes: "notes",
  state: "state",
  substate: "substate",
  classification: "classification",
  reproducibility: "reproducibility",
  priority: "priority",
  component: "componentId",
  milestone: "milestoneId",
  assignee: "assigneeId",
  duplicateOf: "duplicateOfId",
  isRegression: "isRegression",
  dueDate: "dueDate",
};

/** Same normalization diffRadar uses, so the fold is comparable. */
const scalar = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

let fx: Awaited<ReturnType<typeof createFixtures>>;

beforeAll(async () => {
  await destroyFixtures();
  fx = await createFixtures("audit");
});

afterAll(async () => {
  await destroyFixtures();
});

async function newRadar(title = "Audit trail subject") {
  return createRadar({
    actorId: fx.user.id,
    input: {
      title,
      summary: "Filed by the integration suite.",
      classification: "TASK",
      componentId: fx.component.id,
    },
  });
}

describe("audit trail", () => {
  it("records every field change, so replaying the trail rebuilds the row", async () => {
    const created = await newRadar();

    const snapshot = await db.radar.findUniqueOrThrow({
      where: { id: created.id },
    });

    // A deliberately varied sequence: enum moves, FK moves, nulling out,
    // no-ops, prose edits, and a legal state walk.
    const patches: RadarPatch[] = [
      { priority: 1 },
      { title: "Renamed once" },
      { assigneeId: fx.other.id },
      { milestoneId: fx.milestone.id },
      { classification: "SERIOUS_BUG" },
      { reproducibility: "ALWAYS" },
      { priority: 1 }, // no-op, must not produce an event
      { state: "INTEGRATE" },
      { substate: "FIX" },
      { notes: "Some notes." },
      { isRegression: true },
      { dueDate: new Date("2026-10-01T00:00:00.000Z") },
      { state: "VERIFY" },
      { assigneeId: null },
      { milestoneId: null },
      { title: "Renamed twice" },
      { state: "CLOSED", substate: "SOFTWARE_CHANGED" },
      { state: "ANALYZE" }, // reopen
      { priority: 4 },
    ];

    for (const patch of patches) {
      const current = await db.radar.findUniqueOrThrow({
        where: { id: created.id },
        select: { version: true },
      });
      await updateRadar({
        radarId: created.id,
        actorId: fx.user.id,
        expectedVersion: current.version,
        patch,
      });
    }

    const changes = await db.fieldChange.findMany({
      where: { event: { radarId: created.id } },
      orderBy: [{ event: { createdAt: "asc" } }, { id: "asc" }],
      select: { field: true, toValue: true },
    });

    // Fold the trail over the creation snapshot.
    const replayed: Record<string, string | null> = {};
    for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
      void field;
      replayed[column] = scalar(
        (snapshot as unknown as Record<string, unknown>)[column],
      );
    }
    for (const change of changes) {
      const column = FIELD_TO_COLUMN[change.field];
      if (!column) continue; // cc/watcher/relation entries are not columns
      replayed[column] = change.toValue;
    }

    const final = await db.radar.findUniqueOrThrow({ where: { id: created.id } });
    const actual: Record<string, string | null> = {};
    for (const column of Object.values(FIELD_TO_COLUMN)) {
      actual[column] = scalar(
        (final as unknown as Record<string, unknown>)[column],
      );
    }

    expect(replayed).toEqual(actual);
  });

  it("writes no event at all when a patch changes nothing", async () => {
    const created = await newRadar("No-op subject");
    const before = await db.activityEvent.count({
      where: { radarId: created.id },
    });

    await updateRadar({
      radarId: created.id,
      actorId: fx.user.id,
      patch: { title: "No-op subject", priority: 3 },
    });

    expect(await db.activityEvent.count({ where: { radarId: created.id } })).toBe(
      before,
    );
  });

  it("groups one mutation into a single event with one change per field", async () => {
    const created = await newRadar("Grouping subject");
    const baseline = await db.activityEvent.count({
      where: { radarId: created.id },
    });

    await updateRadar({
      radarId: created.id,
      actorId: fx.user.id,
      patch: { state: "INTEGRATE", substate: "FIX", priority: 2 },
    });

    const events = await db.activityEvent.findMany({
      where: { radarId: created.id, kind: "FIELDS_CHANGED" },
      select: { changes: { select: { field: true } } },
    });

    expect(
      await db.activityEvent.count({ where: { radarId: created.id } }),
    ).toBe(baseline + 1);
    expect(events).toHaveLength(1);
    expect(events[0].changes.map((c) => c.field).sort()).toEqual([
      "priority",
      "state",
      "substate",
    ]);
  });

  it("refuses a radar write that has not declared an actor", async () => {
    const created = await newRadar("Guard subject");

    // This is the shape of the mistake the guard exists to prevent: a direct
    // update from somewhere that never went through a mutation.
    await expect(
      db.radar.update({ where: { id: created.id }, data: { priority: 5 } }),
    ).rejects.toThrow(UnauditedWriteError);

    await expect(
      db.radar.delete({ where: { id: created.id } }),
    ).rejects.toThrow(/never hard-deleted/);
  });
});

describe("optimistic concurrency", () => {
  it("lets exactly one of two racing writers win", async () => {
    const created = await newRadar("Race subject");
    const { version } = await db.radar.findUniqueOrThrow({
      where: { id: created.id },
      select: { version: true },
    });

    const results = await Promise.allSettled([
      updateRadar({
        radarId: created.id,
        actorId: fx.user.id,
        expectedVersion: version,
        patch: { priority: 1 },
      }),
      updateRadar({
        radarId: created.id,
        actorId: fx.other.id,
        expectedVersion: version,
        patch: { priority: 5 },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      StaleRadarError,
    );
  });
});

describe("closeAsDuplicate", () => {
  it("writes the FK and the edge together, and never one without the other", async () => {
    const canonical = await newRadar("Canonical subject");
    const dupe = await newRadar("Duplicate subject");

    await closeAsDuplicate({
      radarId: dupe.id,
      actorId: fx.user.id,
      duplicateOfNumber: canonical.number,
    });

    const after = await db.radar.findUniqueOrThrow({
      where: { id: dupe.id },
      select: {
        state: true,
        substate: true,
        duplicateOfId: true,
        resolvedAt: true,
        outgoing: { select: { type: true, targetId: true } },
      },
    });

    expect(after.state).toBe("CLOSED");
    expect(after.substate).toBe("DUPLICATE");
    expect(after.duplicateOfId).toBe(canonical.id);
    expect(after.resolvedAt).not.toBeNull();
    expect(after.outgoing).toEqual([
      { type: "DUPLICATE_OF", targetId: canonical.id },
    ]);
  });

  it("rejects a radar being its own duplicate", async () => {
    const radar = await newRadar("Self duplicate subject");
    await expect(
      closeAsDuplicate({
        radarId: radar.id,
        actorId: fx.user.id,
        duplicateOfNumber: radar.number,
      }),
    ).rejects.toThrow(/cannot be a duplicate of itself/);
  });
});

describe("radar numbers", () => {
  it("issues them from the sequence, above the configured floor", async () => {
    const first = await newRadar("Number subject A");
    const second = await newRadar("Number subject B");

    expect(first.number).toBeGreaterThanOrEqual(100_000_000);
    expect(second.number).toBeGreaterThan(first.number);
  });
});
