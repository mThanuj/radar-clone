import type { Prisma } from "@/generated/prisma/client";
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_ORDER,
  CLASSIFICATION_TONE,
  MILESTONE_STATUS_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  REPRODUCIBILITY_LABEL,
  REPRODUCIBILITY_ORDER,
  STATE_LABEL,
  STATE_TONE,
  SUBSTATE_LABEL,
  type Tone,
} from "@/lib/radar/taxonomy";
import { ALL_STATES, SUBSTATES_BY_STATE } from "@/lib/radar/state-machine";
import { parseDateToken } from "@/lib/search/dates";
import type {
  Condition,
  FieldId,
  FilterOperator,
  QueryContext,
  SortDir,
} from "@/lib/search/types";

/**
 * THE FIELD REGISTRY.
 *
 * One entry per filterable field, declaring everything four subsystems need:
 * the filter-builder UI, URL parsing and validation, the Prisma where clause,
 * sorting, and the result-table column. Adding a field is one object literal
 * instead of five edits that can drift apart.
 *
 * This module is isomorphic — it must stay importable from client components,
 * so the Prisma import is type-only and nothing here touches the database.
 * Option lists that need a query (components, people, milestones)
 * declare an `optionSource` and are hydrated by the page that renders them.
 */

export type FieldKind =
  | "enum"
  | "user"
  | "ref"
  | "text"
  | "number"
  | "date"
  | "bool";

export type Option = { value: string; label: string; tone?: Tone };

export type ColumnRender =
  | "number"
  | "title"
  | "state"
  | "priority"
  | "user"
  | "text"
  | "date"
  | "bool";

export type FieldDef = {
  id: FieldId;
  label: string;
  kind: FieldKind;
  ops: readonly FilterOperator[];
  defaultOp: FilterOperator;
  /** Fixed vocabulary, safe to render without a round trip. */
  staticOptions?: readonly Option[];
  /** Vocabulary that lives in the database; hydrated by the page. */
  optionSource?: "component" | "user" | "milestone";
  toWhere: (c: Condition, ctx: QueryContext) => Prisma.RadarWhereInput;
  orderBy?: (dir: SortDir) => Prisma.RadarOrderByWithRelationInput;
  column?: {
    header: string;
    render: ColumnRender;
    className?: string;
  };
  /** Included in the field-diff audit trail. */
  auditable?: boolean;
};

const ENUM_OPS = ["in", "notIn"] as const;
const REF_OPS = ["in", "notIn", "isSet", "isNotSet"] as const;
const NUM_OPS = ["is", "isNot", "in", "lt", "lte", "gt", "gte"] as const;
const DATE_OPS = ["gte", "lte", "lt", "gt", "isSet", "isNotSet"] as const;
const TEXT_OPS = ["contains", "notContains", "is"] as const;
const BOOL_OPS = ["is"] as const;

const enumOptions = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
  tones?: Record<T, Tone>,
): Option[] =>
  values.map((v) => ({ value: v, label: labels[v], tone: tones?.[v] }));

/** `me` resolves to the signed-in user; `none` means NULL. */
function resolveUserValues(values: string[], ctx: QueryContext) {
  const ids = values
    .filter((v) => v !== "none")
    .map((v) => (v === "me" ? ctx.userId : v));
  return { ids, includesNone: values.includes("none") };
}

function dateWhere(c: Condition): Prisma.DateTimeFilter | undefined {
  if (c.op === "isSet" || c.op === "isNotSet") return undefined;
  const value = parseDateToken(c.values[0]);
  switch (c.op) {
    case "lt":
      return { lt: value };
    case "lte":
      return { lte: value };
    case "gt":
      return { gt: value };
    default:
      return { gte: value };
  }
}

function dateField(
  id: FieldId,
  label: string,
  key: "createdAt" | "updatedAt" | "lastActivityAt" | "stateChangedAt",
): FieldDef {
  return {
    id,
    label,
    kind: "date",
    ops: DATE_OPS,
    defaultOp: "gte",
    toWhere: (c) => ({ [key]: dateWhere(c) }) as Prisma.RadarWhereInput,
    orderBy: (dir) => ({ [key]: dir }) as Prisma.RadarOrderByWithRelationInput,
    column: { header: label, render: "date" },
  };
}

function nullableDateField(
  id: FieldId,
  label: string,
  key: "resolvedAt" | "dueDate",
): FieldDef {
  return {
    id,
    label,
    kind: "date",
    ops: DATE_OPS,
    defaultOp: "gte",
    toWhere: (c) =>
      c.op === "isSet"
        ? ({ [key]: { not: null } } as Prisma.RadarWhereInput)
        : c.op === "isNotSet"
          ? ({ [key]: null } as Prisma.RadarWhereInput)
          : ({ [key]: dateWhere(c) } as Prisma.RadarWhereInput),
    orderBy: (dir) => ({ [key]: dir }) as Prisma.RadarOrderByWithRelationInput,
    column: { header: label, render: "date" },
    auditable: key === "dueDate",
  };
}

export const FIELDS: Record<FieldId, FieldDef> = {
  number: {
    id: "number",
    label: "Number",
    kind: "number",
    ops: NUM_OPS,
    defaultOp: "is",
    toWhere: (c) => ({ number: { in: c.values.map(Number) } }),
    orderBy: (dir) => ({ number: dir }),
    column: { header: "ID", render: "number", className: "w-[7.5rem]" },
  },

  title: {
    id: "title",
    label: "Title",
    kind: "text",
    ops: TEXT_OPS,
    defaultOp: "contains",
    toWhere: (c) =>
      c.op === "notContains"
        ? { NOT: { title: { contains: c.values[0], mode: "insensitive" } } }
        : { title: { contains: c.values[0], mode: "insensitive" } },
    orderBy: (dir) => ({ title: dir }),
    column: { header: "Title", render: "title" },
    auditable: true,
  },

  state: {
    id: "state",
    label: "State",
    kind: "enum",
    ops: ENUM_OPS,
    defaultOp: "in",
    staticOptions: enumOptions(ALL_STATES, STATE_LABEL, STATE_TONE),
    toWhere: (c) =>
      c.op === "notIn"
        ? { state: { notIn: c.values as never } }
        : { state: { in: c.values as never } },
    orderBy: (dir) => ({ state: dir }),
    column: { header: "State", render: "state", className: "w-[9rem]" },
    auditable: true,
  },

  substate: {
    id: "substate",
    label: "Substate",
    kind: "enum",
    ops: ENUM_OPS,
    defaultOp: "in",
    staticOptions: enumOptions(
      Object.values(SUBSTATES_BY_STATE).flat(),
      SUBSTATE_LABEL,
    ),
    toWhere: (c) =>
      c.op === "notIn"
        ? { substate: { notIn: c.values as never } }
        : { substate: { in: c.values as never } },
    orderBy: (dir) => ({ substate: dir }),
    column: { header: "Substate", render: "text", className: "w-[11rem]" },
    auditable: true,
  },

  classification: {
    id: "classification",
    label: "Classification",
    kind: "enum",
    ops: ENUM_OPS,
    defaultOp: "in",
    staticOptions: enumOptions(
      CLASSIFICATION_ORDER,
      CLASSIFICATION_LABEL,
      CLASSIFICATION_TONE,
    ),
    toWhere: (c) =>
      c.op === "notIn"
        ? { classification: { notIn: c.values as never } }
        : { classification: { in: c.values as never } },
    orderBy: (dir) => ({ classification: dir }),
    column: { header: "Classification", render: "text" },
    auditable: true,
  },

  reproducibility: {
    id: "reproducibility",
    label: "Reproducibility",
    kind: "enum",
    ops: ENUM_OPS,
    defaultOp: "in",
    staticOptions: enumOptions(REPRODUCIBILITY_ORDER, REPRODUCIBILITY_LABEL),
    toWhere: (c) => ({ reproducibility: { in: c.values as never } }),
    orderBy: (dir) => ({ reproducibility: dir }),
    column: { header: "Reproducibility", render: "text" },
    auditable: true,
  },

  priority: {
    id: "priority",
    label: "Priority",
    kind: "number",
    ops: NUM_OPS,
    defaultOp: "in",
    staticOptions: [1, 2, 3, 4, 5].map((p) => ({
      value: String(p),
      label: PRIORITY_LABEL[p],
      tone: PRIORITY_TONE[p],
    })),
    toWhere: (c) => {
      const nums = c.values.map(Number).filter((n) => !Number.isNaN(n));
      switch (c.op) {
        case "lt":
          return { priority: { lt: nums[0] } };
        case "lte":
          return { priority: { lte: nums[0] } };
        case "gt":
          return { priority: { gt: nums[0] } };
        case "gte":
          return { priority: { gte: nums[0] } };
        case "isNot":
        case "notIn":
          return { priority: { notIn: nums } };
        default:
          return { priority: { in: nums } };
      }
    },
    orderBy: (dir) => ({ priority: dir }),
    column: { header: "Priority", render: "priority", className: "w-[5.5rem]" },
    auditable: true,
  },

  component: {
    id: "component",
    label: "Component",
    kind: "ref",
    ops: ["in", "notIn", "under"],
    defaultOp: "in",
    optionSource: "component",
    // `under:` is why Component.path is materialized — a subtree filter is a
    // prefix scan on an indexed column instead of a recursive CTE.
    toWhere: (c) =>
      c.op === "under"
        ? { component: { path: { startsWith: c.values[0] } } }
        : c.op === "notIn"
          ? { componentId: { notIn: c.values } }
          : { componentId: { in: c.values } },
    orderBy: (dir) => ({ component: { path: dir } }),
    column: { header: "Component", render: "text" },
    auditable: true,
  },

  milestone: {
    id: "milestone",
    label: "Milestone",
    kind: "ref",
    ops: REF_OPS,
    defaultOp: "in",
    optionSource: "milestone",
    toWhere: (c) =>
      c.op === "isSet"
        ? { milestoneId: { not: null } }
        : c.op === "isNotSet"
          ? { milestoneId: null }
          : { milestoneId: { in: c.values } },
    orderBy: (dir) => ({ milestone: { name: dir } }),
    column: { header: "Milestone", render: "text" },
    auditable: true,
  },

  assignee: {
    id: "assignee",
    label: "Assignee",
    kind: "user",
    ops: REF_OPS,
    defaultOp: "in",
    optionSource: "user",
    toWhere: (c, ctx) => {
      if (c.op === "isSet") return { assigneeId: { not: null } };
      if (c.op === "isNotSet") return { assigneeId: null };
      const { ids, includesNone } = resolveUserValues(c.values, ctx);
      if (c.op === "notIn") return { NOT: { assigneeId: { in: ids } } };
      if (includesNone && ids.length)
        return { OR: [{ assigneeId: null }, { assigneeId: { in: ids } }] };
      if (includesNone) return { assigneeId: null };
      return { assigneeId: { in: ids } };
    },
    orderBy: (dir) => ({ assignee: { name: dir } }),
    column: { header: "Assignee", render: "user", className: "w-[12rem]" },
    auditable: true,
  },

  /**
   * People working the radar alongside its assignee. Stored as a subscriber
   * role, so this reads the same join `cc` does — "who is on this" is one
   * question with three answers, not three tables.
   */
  helper: {
    id: "helper",
    label: "Helper",
    kind: "user",
    ops: ["in"],
    defaultOp: "in",
    optionSource: "user",
    toWhere: (c, ctx) => {
      const { ids } = resolveUserValues(c.values, ctx);
      return { subscribers: { some: { userId: { in: ids }, role: "HELPER" } } };
    },
  },

  originator: {
    id: "originator",
    label: "Originator",
    kind: "user",
    ops: ["in", "notIn"],
    defaultOp: "in",
    optionSource: "user",
    toWhere: (c, ctx) => {
      const { ids } = resolveUserValues(c.values, ctx);
      return c.op === "notIn"
        ? { NOT: { originatorId: { in: ids } } }
        : { originatorId: { in: ids } };
    },
    orderBy: (dir) => ({ originator: { name: dir } }),
    column: { header: "Originator", render: "user", className: "w-[12rem]" },
  },

  cc: {
    id: "cc",
    label: "CC",
    kind: "user",
    ops: ["in"],
    defaultOp: "in",
    optionSource: "user",
    toWhere: (c, ctx) => {
      const { ids } = resolveUserValues(c.values, ctx);
      return { subscribers: { some: { userId: { in: ids }, role: "CC" } } };
    },
  },

  watching: {
    id: "watching",
    label: "Watched by",
    kind: "user",
    ops: ["in"],
    defaultOp: "in",
    optionSource: "user",
    toWhere: (c, ctx) => {
      const { ids } = resolveUserValues(c.values, ctx);
      return { subscribers: { some: { userId: { in: ids } } } };
    },
  },

  isRegression: {
    id: "isRegression",
    label: "Regression",
    kind: "bool",
    ops: BOOL_OPS,
    defaultOp: "is",
    staticOptions: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    toWhere: (c) => ({ isRegression: c.values[0] !== "false" }),
    column: { header: "Regression", render: "bool", className: "w-[6rem]" },
    auditable: true,
  },

  duplicateOf: {
    id: "duplicateOf",
    label: "Duplicate of",
    kind: "ref",
    ops: ["isSet", "isNotSet", "in"],
    defaultOp: "isSet",
    toWhere: (c) =>
      c.op === "isNotSet"
        ? { duplicateOfId: null }
        : c.op === "in"
          ? { duplicateOf: { number: { in: c.values.map(Number) } } }
          : { duplicateOfId: { not: null } },
    auditable: true,
  },

  hasDuplicates: {
    id: "hasDuplicates",
    label: "Has duplicates",
    kind: "bool",
    ops: BOOL_OPS,
    defaultOp: "is",
    staticOptions: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    toWhere: (c) =>
      c.values[0] === "false"
        ? { duplicates: { none: {} } }
        : { duplicates: { some: {} } },
  },

  isBlocked: {
    id: "isBlocked",
    label: "Blocked",
    kind: "bool",
    ops: BOOL_OPS,
    defaultOp: "is",
    staticOptions: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    // Blocked = something that is still open BLOCKS this radar.
    toWhere: (c) => {
      const blocker = {
        some: { type: "BLOCKS" as const, source: { state: { not: "CLOSED" as const } } },
      };
      return c.values[0] === "false"
        ? { NOT: { incoming: blocker } }
        : { incoming: blocker };
    },
  },

  createdAt: dateField("createdAt", "Created", "createdAt"),
  updatedAt: dateField("updatedAt", "Updated", "updatedAt"),
  lastActivityAt: dateField("lastActivityAt", "Last activity", "lastActivityAt"),
  stateChangedAt: dateField("stateChangedAt", "State changed", "stateChangedAt"),
  resolvedAt: nullableDateField("resolvedAt", "Resolved", "resolvedAt"),
  dueDate: nullableDateField("dueDate", "Due", "dueDate"),
};

export const FILTERABLE_FIELDS = Object.values(FIELDS);

export const COLUMN_FIELDS = FILTERABLE_FIELDS.filter((f) => f.column);

export const SORTABLE_FIELDS = FILTERABLE_FIELDS.filter((f) => f.orderBy);

export const GROUPABLE_FIELDS: FieldId[] = [
  "state",
  "substate",
  "priority",
  "assignee",
  "component",
  "milestone",
  "classification",
];

/** Fields whose changes are written to the activity trail. */
export const AUDITED_FIELDS = FILTERABLE_FIELDS.filter((f) => f.auditable);

export function fieldById(id: string): FieldDef | undefined {
  return (FIELDS as Record<string, FieldDef>)[id];
}

/** Extra option lists loaded per request for fields backed by tables. */
export type OptionSources = Partial<
  Record<NonNullable<FieldDef["optionSource"]>, Option[]>
>;

export function optionsFor(
  field: FieldDef,
  sources: OptionSources,
): Option[] {
  if (field.staticOptions) return [...field.staticOptions];
  if (field.optionSource) return sources[field.optionSource] ?? [];
  return [];
}

export const MILESTONE_STATUS_OPTIONS = Object.entries(
  MILESTONE_STATUS_LABEL,
).map(([value, label]) => ({ value, label }));
