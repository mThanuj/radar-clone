import { fieldById, FIELDS } from "@/lib/search/fields";
import { isDateToken } from "@/lib/search/dates";
import {
  DEFAULT_COLUMNS,
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  FILTER_OPERATORS,
  MAX_PER_PAGE,
  NULLARY_OPERATORS,
  type Condition,
  type FieldId,
  type FilterError,
  type FilterOperator,
  type RadarQuery,
  type SortDir,
} from "@/lib/search/types";

/**
 * URL <-> RadarQuery.
 *
 * One param per field, formatted `op:v1,v2`, with the operator omitted when
 * it is the field's default. The result is a URL you can read, edit by hand,
 * and paste to someone else:
 *
 *   /radars?state=in:ANALYZE,INTEGRATE&priority=lte:2&assignee=me&sort=-priority
 *
 * parseSearchParams is total: anything malformed becomes a FilterError that
 * the filter bar renders as a chip, never a 500. toSearchParams is canonical
 * (stable key order, stable value order, defaults omitted) so a SavedQuery's
 * stored string is comparable and the round-trip property test holds.
 */

const RESERVED = new Set(["text", "sort", "group", "cols", "page", "per"]);

function parseCondition(
  fieldId: FieldId,
  raw: string,
): { condition?: Condition; error?: string } {
  const field = FIELDS[fieldId];
  const separator = raw.indexOf(":");
  let op: FilterOperator = field.defaultOp;
  let rest = raw;

  if (separator > 0) {
    const candidate = raw.slice(0, separator) as FilterOperator;
    if ((FILTER_OPERATORS as readonly string[]).includes(candidate)) {
      op = candidate;
      rest = raw.slice(separator + 1);
    }
  } else if (NULLARY_OPERATORS.includes(raw as FilterOperator)) {
    // Valueless operators carry no colon: `milestone=isSet`
    op = raw as FilterOperator;
    rest = "";
  }

  if (!field.ops.includes(op)) {
    return {
      error: `${field.label} does not support "${op}". Try: ${field.ops.join(", ")}.`,
    };
  }

  const values = NULLARY_OPERATORS.includes(op)
    ? []
    : rest
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

  if (!NULLARY_OPERATORS.includes(op) && values.length === 0) {
    return { error: `${field.label} needs a value.` };
  }

  if (field.kind === "number") {
    const bad = values.find((v) => Number.isNaN(Number(v)));
    if (bad) return { error: `${field.label}: "${bad}" is not a number.` };
  }

  if (field.kind === "date") {
    const bad = values.find((v) => !isDateToken(v));
    if (bad) return { error: `${field.label}: "${bad}" is not a date.` };
  }

  if (field.staticOptions && field.kind === "enum") {
    const allowed = new Set(field.staticOptions.map((o) => o.value));
    const bad = values.find((v) => !allowed.has(v));
    if (bad) return { error: `${field.label}: "${bad}" is not a valid value.` };
  }

  return { condition: { field: fieldId, op, values } };
}

function parseSort(raw: string): {
  sort: RadarQuery["sort"];
  errors: string[];
} {
  const sort: RadarQuery["sort"] = [];
  const errors: string[] = [];
  for (const token of raw.split(",").filter(Boolean)) {
    const dir: SortDir = token.startsWith("-") ? "desc" : "asc";
    const id = token.replace(/^-/, "");
    const field = fieldById(id);
    if (!field?.orderBy) {
      errors.push(`Cannot sort by "${id}".`);
      continue;
    }
    sort.push({ field: field.id, dir });
  }
  return { sort, errors };
}

export function parseSearchParams(
  params: URLSearchParams,
): { query: RadarQuery; errors: FilterError[] } {
  const errors: FilterError[] = [];
  const conditions: Condition[] = [];

  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    const field = fieldById(key);
    if (!field) continue; // unknown params are dropped, not fatal
    const { condition, error } = parseCondition(field.id, raw);
    if (error) errors.push({ param: key, message: error });
    else if (condition) conditions.push(condition);
  }

  const sortRaw = params.get("sort");
  const parsedSort = sortRaw ? parseSort(sortRaw) : { sort: [], errors: [] };
  for (const message of parsedSort.errors) errors.push({ param: "sort", message });

  const groupRaw = params.get("group");
  const groupField = groupRaw ? fieldById(groupRaw) : undefined;
  if (groupRaw && !groupField) {
    errors.push({ param: "group", message: `Cannot group by "${groupRaw}".` });
  }

  const colsRaw = params.get("cols");
  const columns = colsRaw
    ? colsRaw
        .split(",")
        .map((c) => fieldById(c))
        .filter((f): f is NonNullable<typeof f> => Boolean(f?.column))
        .map((f) => f.id)
    : DEFAULT_COLUMNS;

  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Number(params.get("per") ?? DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE),
  );

  return {
    query: {
      text: params.get("text")?.trim() || undefined,
      conditions,
      sort: parsedSort.sort.length ? parsedSort.sort : DEFAULT_SORT,
      group: groupField?.id ?? null,
      columns: columns.length ? columns : DEFAULT_COLUMNS,
      page,
      perPage,
    },
    errors,
  };
}

const sameColumns = (a: FieldId[], b: FieldId[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameSort = (a: RadarQuery["sort"], b: RadarQuery["sort"]) =>
  a.length === b.length &&
  a.every((s, i) => s.field === b[i].field && s.dir === b[i].dir);

export function toSearchParams(query: RadarQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.text) params.set("text", query.text);

  // Sorted so the same logical query always produces the same string —
  // SavedQuery.params is compared as text.
  const conditions = [...query.conditions].sort((a, b) =>
    a.field.localeCompare(b.field),
  );
  for (const condition of conditions) {
    const field = FIELDS[condition.field];
    if (NULLARY_OPERATORS.includes(condition.op)) {
      params.set(condition.field, condition.op);
      continue;
    }
    const prefix = condition.op === field.defaultOp ? "" : `${condition.op}:`;
    const values = [...condition.values].sort().join(",");
    params.set(condition.field, `${prefix}${values}`);
  }

  if (!sameSort(query.sort, DEFAULT_SORT)) {
    params.set(
      "sort",
      query.sort.map((s) => (s.dir === "desc" ? `-${s.field}` : s.field)).join(","),
    );
  }
  if (query.group) params.set("group", query.group);
  if (!sameColumns(query.columns, DEFAULT_COLUMNS)) {
    params.set("cols", query.columns.join(","));
  }
  if (query.page > 1) params.set("page", String(query.page));
  if (query.perPage !== DEFAULT_PER_PAGE) params.set("per", String(query.perPage));

  return params;
}

export function queryToString(query: RadarQuery): string {
  return toSearchParams(query).toString();
}

/** Convenience for links: /radars?<canonical params> */
export function radarsHref(query: RadarQuery): string {
  const qs = queryToString(query);
  return qs ? `/radars?${qs}` : "/radars";
}

export function withCondition(
  query: RadarQuery,
  condition: Condition,
): RadarQuery {
  const conditions = query.conditions.filter((c) => c.field !== condition.field);
  return { ...query, conditions: [...conditions, condition], page: 1 };
}

export function withoutField(query: RadarQuery, field: FieldId): RadarQuery {
  return {
    ...query,
    conditions: query.conditions.filter((c) => c.field !== field),
    page: 1,
  };
}

export function withSort(query: RadarQuery, field: FieldId): RadarQuery {
  const current = query.sort[0];
  const dir: SortDir =
    current?.field === field && current.dir === "asc" ? "desc" : "asc";
  return { ...query, sort: [{ field, dir }], page: 1 };
}
