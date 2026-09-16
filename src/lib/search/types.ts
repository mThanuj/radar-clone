/**
 * Query shape shared by the filter bar, the URL codec, and the Prisma
 * compiler. Everything is strings until the field registry coerces it, so a
 * query round-trips through the URL without a schema on both ends.
 */

export const FILTER_OPERATORS = [
  "is",
  "isNot",
  "in",
  "notIn",
  "contains",
  "notContains",
  "lt",
  "lte",
  "gt",
  "gte",
  "isSet",
  "isNotSet",
  "under",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Operators that take no values. */
export const NULLARY_OPERATORS: readonly FilterOperator[] = [
  "isSet",
  "isNotSet",
];

export const FIELD_IDS = [
  "number",
  "title",
  "state",
  "substate",
  "classification",
  "reproducibility",
  "priority",
  "component",
  "milestone",
  "assignee",
  "helper",
  "originator",
  "cc",
  "watching",
  "isRegression",
  "duplicateOf",
  "hasDuplicates",
  "isBlocked",
  "createdAt",
  "updatedAt",
  "lastActivityAt",
  "stateChangedAt",
  "resolvedAt",
  "dueDate",
] as const;

export type FieldId = (typeof FIELD_IDS)[number];

export type SortDir = "asc" | "desc";

export type Condition = {
  field: FieldId;
  op: FilterOperator;
  /** Always strings; OR'd together within one condition. */
  values: string[];
};

export type RadarQuery = {
  /** Free text, matched against title/summary/comments via trigram ILIKE. */
  text?: string;
  /** AND across conditions, OR within each condition's values. */
  conditions: Condition[];
  sort: { field: FieldId; dir: SortDir }[];
  group: FieldId | null;
  columns: FieldId[];
  page: number;
  perPage: number;
};

/** Everything the registry needs that isn't in the query itself. */
export type QueryContext = { userId: string };

export type FilterError = { param: string; message: string };

export const DEFAULT_COLUMNS: FieldId[] = [
  "number",
  "title",
  "state",
  "priority",
  "assignee",
  "component",
  "lastActivityAt",
];

export const DEFAULT_SORT: RadarQuery["sort"] = [
  { field: "lastActivityAt", dir: "desc" },
];

export const DEFAULT_PER_PAGE = 50;
export const MAX_PER_PAGE = 200;

export const EMPTY_QUERY: RadarQuery = {
  conditions: [],
  sort: DEFAULT_SORT,
  group: null,
  columns: DEFAULT_COLUMNS,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
};
