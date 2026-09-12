import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSearchParams, toSearchParams, radarsHref } from "@/lib/search/url";
import { FIELDS } from "@/lib/search/fields";
import {
  DEFAULT_COLUMNS,
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  FIELD_IDS,
  NULLARY_OPERATORS,
  type Condition,
  type FieldId,
  type RadarQuery,
} from "@/lib/search/types";

/** Generate only values the field would actually accept. */
const conditionFor = (field: FieldId): fc.Arbitrary<Condition> => {
  const def = FIELDS[field];
  return fc.constantFrom(...def.ops).chain((op) => {
    if (NULLARY_OPERATORS.includes(op)) {
      return fc.constant({ field, op, values: [] as string[] });
    }
    let values: fc.Arbitrary<string[]>;
    if (def.staticOptions?.length) {
      values = fc
        .uniqueArray(fc.constantFrom(...def.staticOptions.map((o) => o.value)), {
          minLength: 1,
          maxLength: 3,
        })
        .map((v) => [...v].sort());
    } else if (def.kind === "number") {
      values = fc
        .uniqueArray(fc.integer({ min: 1, max: 999 }).map(String), {
          minLength: 1,
          maxLength: 2,
        })
        .map((v) => [...v].sort());
    } else if (def.kind === "date") {
      values = fc
        .constantFrom("-7d", "-3mo", "today", "now", "2026-01-15")
        .map((v) => [v]);
    } else {
      values = fc
        .uniqueArray(
          fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/),
          { minLength: 1, maxLength: 2 },
        )
        .map((v) => [...v].sort());
    }
    return values.map((v) => ({ field, op, values: v }));
  });
};

const arbQuery: fc.Arbitrary<RadarQuery> = fc
  .uniqueArray(fc.constantFrom(...FIELD_IDS), { minLength: 0, maxLength: 5 })
  .chain((fields) =>
    fc.record({
      // No leading/trailing spaces: parseSearchParams trims text on purpose,
      // so generating padded strings would test the generator, not the codec.
      text: fc.option(
        fc.stringMatching(/^[a-zA-Z0-9]([a-zA-Z0-9 ]{0,14}[a-zA-Z0-9])?$/),
        { nil: undefined },
      ),
      conditions: fc.tuple(...fields.map(conditionFor)),
      sort: fc.uniqueArray(
        fc.record({
          field: fc.constantFrom(
            ...FIELD_IDS.filter((f) => FIELDS[f].orderBy),
          ),
          dir: fc.constantFrom("asc" as const, "desc" as const),
        }),
        { minLength: 1, maxLength: 2, selector: (s) => s.field },
      ),
      group: fc.option(fc.constantFrom(...FIELD_IDS), { nil: null }),
      columns: fc.uniqueArray(
        fc.constantFrom(...FIELD_IDS.filter((f) => FIELDS[f].column)),
        { minLength: 1, maxLength: 6 },
      ),
      page: fc.integer({ min: 1, max: 40 }),
      perPage: fc.integer({ min: 1, max: 200 }),
    }),
  );

/** Conditions come back sorted by field; compare order-insensitively. */
const normalize = (q: RadarQuery) => ({
  ...q,
  conditions: [...q.conditions].sort((a, b) => a.field.localeCompare(b.field)),
});

describe("search URL codec", () => {
  it("round-trips any valid query", () => {
    fc.assert(
      fc.property(arbQuery, (query) => {
        const { query: parsed, errors } = parseSearchParams(
          toSearchParams(query),
        );
        expect(errors).toEqual([]);
        expect(normalize(parsed)).toEqual(normalize(query));
      }),
      { numRuns: 300 },
    );
  });

  it("is canonical — logically equal queries serialize identically", () => {
    const a: RadarQuery = {
      conditions: [
        { field: "priority", op: "in", values: ["2", "1"] },
        { field: "state", op: "in", values: ["ANALYZE"] },
      ],
      sort: DEFAULT_SORT,
      group: null,
      columns: DEFAULT_COLUMNS,
      page: 1,
      perPage: DEFAULT_PER_PAGE,
    };
    const b: RadarQuery = { ...a, conditions: [...a.conditions].reverse() };
    // reversed conditions, reversed values — same canonical string
    b.conditions = [
      { field: "state", op: "in", values: ["ANALYZE"] },
      { field: "priority", op: "in", values: ["1", "2"] },
    ];
    expect(toSearchParams(a).toString()).toBe(toSearchParams(b).toString());
  });

  it("omits defaults so a plain queue URL stays clean", () => {
    expect(
      radarsHref({
        conditions: [{ field: "assignee", op: "in", values: ["me"] }],
        sort: DEFAULT_SORT,
        group: null,
        columns: DEFAULT_COLUMNS,
        page: 1,
        perPage: DEFAULT_PER_PAGE,
      }),
    ).toBe("/radars?assignee=me");
  });

  it("reports bad input instead of throwing", () => {
    const { query, errors } = parseSearchParams(
      new URLSearchParams("state=in:NOT_A_STATE&priority=lte:abc&nonsense=1"),
    );
    expect(errors.map((e) => e.param).sort()).toEqual(["priority", "state"]);
    // unknown params are dropped silently, valid ones survive
    expect(query.conditions).toEqual([]);
  });

  it("understands operator prefixes and defaults", () => {
    const { query } = parseSearchParams(
      new URLSearchParams("state=ANALYZE,VERIFY&priority=lte:2&milestone=isSet"),
    );
    expect(query.conditions).toEqual([
      { field: "state", op: "in", values: ["ANALYZE", "VERIFY"] },
      { field: "priority", op: "lte", values: ["2"] },
      { field: "milestone", op: "isSet", values: [] },
    ]);
  });
});
