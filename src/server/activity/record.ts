import "server-only";
import type { ActivityKind, NotificationReason } from "@/generated/prisma/enums";
import {
  CLASSIFICATION_LABEL,
  PRIORITY_SHORT,
  REPRODUCIBILITY_LABEL,
  STATE_LABEL,
  SUBSTATE_LABEL,
} from "@/lib/radar/taxonomy";
import { fullDate } from "@/lib/radar/format";
import { noteRecipients } from "@/server/context";
import { fanOut } from "@/server/notifications/fanout";
import type { Tx } from "@/server/tx";

/**
 * The audit trail.
 *
 * One ActivityEvent per mutation, N FieldChange children — so changing state,
 * substate and assignee in one save reads as a single line in the feed rather
 * than three.
 *
 * FieldChange is the universal payload: scalars, relations and CC all
 * serialize into the same four columns. `*Label` is a snapshot taken at
 * write time so history stays readable after a component is moved or
 * renamed; `*Value` stays queryable, which is what makes
 * `field='state' AND toValue='CLOSED'` a burnup data source.
 */

export type FieldChangeInput = {
  field: string;
  fromValue?: string | null;
  toValue?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
};

/** Radar column -> audit field key. */
const AUDITED_COLUMNS = [
  ["title", "title"],
  ["summary", "summary"],
  ["stepsToReproduce", "stepsToReproduce"],
  ["expectedResults", "expectedResults"],
  ["actualResults", "actualResults"],
  ["versionBuild", "versionBuild"],
  ["configuration", "configuration"],
  ["notes", "notes"],
  ["state", "state"],
  ["substate", "substate"],
  ["classification", "classification"],
  ["reproducibility", "reproducibility"],
  ["priority", "priority"],
  ["componentId", "component"],
  ["milestoneId", "milestone"],
  ["assigneeId", "assignee"],
  ["duplicateOfId", "duplicateOf"],
  ["isRegression", "isRegression"],
  ["dueDate", "dueDate"],
] as const;

/** Long-form prose: record that it changed, not the whole before/after. */
const PROSE_FIELDS = new Set([
  "summary",
  "stepsToReproduce",
  "expectedResults",
  "actualResults",
  "configuration",
  "notes",
]);

type RadarLike = Record<string, unknown>;

function scalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Raw before/after diff. Labels are resolved separately because that needs
 * database lookups and this stays pure — which is what makes it easy to test.
 */
export function diffRadar(
  before: RadarLike,
  after: RadarLike,
): FieldChangeInput[] {
  const changes: FieldChangeInput[] = [];
  for (const [column, field] of AUDITED_COLUMNS) {
    const from = scalar(before[column]);
    const to = scalar(after[column]);
    if (from === to) continue;
    changes.push({ field, fromValue: from, toValue: to });
  }
  return changes;
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  state: STATE_LABEL,
  substate: SUBSTATE_LABEL,
  classification: CLASSIFICATION_LABEL,
  reproducibility: REPRODUCIBILITY_LABEL,
};

/** Which table a FK-valued audit field points at. */
const LOOKUPS = {
  component: "component",
  milestone: "milestone",
  assignee: "user",
  cc: "user",
  watcher: "user",
  duplicateOf: "radar",
} as const;

async function labelFor(
  tx: Tx,
  field: string,
  value: string | null,
): Promise<string | null> {
  if (value === null) return null;

  if (PROSE_FIELDS.has(field)) return null;
  if (field === "priority") return PRIORITY_SHORT[Number(value)] ?? value;
  if (field === "isRegression") return value === "true" ? "Yes" : "No";
  if (field === "dueDate") return fullDate(value);
  if (ENUM_LABELS[field]) return ENUM_LABELS[field][value] ?? value;

  const table = (LOOKUPS as Record<string, string>)[field];
  if (!table) return value;

  switch (table) {
    case "component": {
      const row = await tx.component.findUnique({
        where: { id: value },
        select: { path: true },
      });
      return row?.path ?? value;
    }
    case "milestone": {
      const row = await tx.milestone.findUnique({
        where: { id: value },
        select: { name: true },
      });
      return row?.name ?? value;
    }
    case "user": {
      const row = await tx.user.findUnique({
        where: { id: value },
        select: { name: true },
      });
      return row?.name ?? value;
    }
    case "radar": {
      const row = await tx.radar.findUnique({
        where: { id: value },
        select: { number: true, title: true },
      });
      return row ? `${row.number} — ${row.title}` : value;
    }
    default:
      return value;
  }
}

/** Attach display snapshots to a raw diff. */
export async function labelChanges(
  tx: Tx,
  changes: FieldChangeInput[],
): Promise<FieldChangeInput[]> {
  return Promise.all(
    changes.map(async (change) => ({
      ...change,
      fromLabel:
        change.fromLabel ?? (await labelFor(tx, change.field, change.fromValue ?? null)),
      toLabel:
        change.toLabel ?? (await labelFor(tx, change.field, change.toValue ?? null)),
    })),
  );
}

/**
 * Write one event plus its changes, bump lastActivityAt, and notify.
 * Every audited mutation ends here.
 */
export async function recordActivity(
  tx: Tx,
  args: {
    radarId: string;
    actorId: string | null;
    kind: ActivityKind;
    changes?: FieldChangeInput[];
    commentId?: string;
    note?: string;
    direct?: { userId: string; reason: NotificationReason }[];
    commentExcerpt?: string | null;
    notify?: boolean;
  },
) {
  const changes = args.changes ?? [];

  const event = await tx.activityEvent.create({
    data: {
      radarId: args.radarId,
      actorId: args.actorId,
      kind: args.kind,
      note: args.note,
      commentId: args.commentId,
      changes: changes.length
        ? {
            create: changes.map((c) => ({
              field: c.field,
              fromValue: c.fromValue ?? null,
              toValue: c.toValue ?? null,
              fromLabel: c.fromLabel ?? null,
              toLabel: c.toLabel ?? null,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  // lastActivityAt drives the default sort and the "stale" views, so it has
  // to move for every kind of activity, not just field edits. This is a
  // sanctioned write from inside the audited path.
  await tx.radar.updateMany({
    where: { id: args.radarId },
    data: { lastActivityAt: new Date() },
  });

  if (args.notify !== false) {
    // The diff drives which reason each recipient gets, so hand it over whole
    // rather than a boolean about state.
    const recipients = await fanOut(tx, {
      radarId: args.radarId,
      eventId: event.id,
      actorId: args.actorId,
      kind: args.kind,
      changes,
      direct: args.direct,
      commentExcerpt: args.commentExcerpt,
    });
    // Surfaced to the enclosing withAuditResult so the action can push to
    // these people once the transaction has actually committed.
    noteRecipients(recipients);
    return { ...event, recipients };
  }

  return { ...event, recipients: [] as string[] };
}
