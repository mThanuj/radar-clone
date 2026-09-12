import { describe, expect, it } from "vitest";
import {
  RELATION_META,
  RELATION_TYPES,
  isSymmetric,
  invertRelation,
  normalizeSymmetric,
  orientRelation,
  relationLabel,
  wouldCreateCycle,
} from "@/lib/radar/relations";

describe("relation labels", () => {
  it("labels both directions of every stored type", () => {
    for (const type of RELATION_TYPES) {
      expect(relationLabel(type, true)).toBe(RELATION_META[type].forward);
      expect(relationLabel(type, false)).toBe(RELATION_META[type].inverse);
      expect(invertRelation(type)).toBe(RELATION_META[type].inverse);
    }
  });

  it("gives symmetric types the same label from either side", () => {
    // RELATED_TO reads the same in both directions; nothing else should.
    for (const type of RELATION_TYPES) {
      const same = RELATION_META[type].forward === RELATION_META[type].inverse;
      expect(same).toBe(isSymmetric(type));
    }
  });
});

describe("orientRelation", () => {
  const edge = { sourceId: "a", targetId: "b", type: "BLOCKS" as const };

  it("reads forward from the source", () => {
    const result = orientRelation(edge, "a", (id) => id);
    expect(result).toEqual({ other: "b", label: "Blocks", fromSource: true });
  });

  it("reads inverted from the target — one row, two readings", () => {
    const result = orientRelation(edge, "b", (id) => id);
    expect(result).toEqual({ other: "a", label: "Blocked by", fromSource: false });
  });
});

describe("normalizeSymmetric", () => {
  it("orders symmetric pairs so the unique index actually dedupes them", () => {
    const forward = normalizeSymmetric("b", "a", "RELATED_TO");
    const backward = normalizeSymmetric("a", "b", "RELATED_TO");
    expect(forward).toEqual(backward);
    expect(forward).toEqual({ sourceId: "a", targetId: "b" });
  });

  it("leaves directional pairs exactly as given", () => {
    expect(normalizeSymmetric("b", "a", "BLOCKS")).toEqual({
      sourceId: "b",
      targetId: "a",
    });
  });
});

describe("wouldCreateCycle", () => {
  // a -> b -> c, where parentsOf(child) returns its parents
  const parents: Record<string, string[]> = { b: ["a"], c: ["b"] };
  const parentsOf = async (id: string) => parents[id] ?? [];

  it("catches a radar being made its own parent", async () => {
    expect(await wouldCreateCycle("a", "a", parentsOf)).toBe(true);
  });

  it("catches an indirect cycle through the chain", async () => {
    // making `a` a child of `c` closes the loop a -> b -> c -> a
    expect(await wouldCreateCycle("a", "c", parentsOf)).toBe(true);
  });

  it("allows an unrelated parent", async () => {
    expect(await wouldCreateCycle("d", "c", parentsOf)).toBe(false);
  });

  it("terminates on an already-cyclic graph rather than looping forever", async () => {
    const cyclic: Record<string, string[]> = { x: ["y"], y: ["x"] };
    expect(
      await wouldCreateCycle("z", "x", async (id) => cyclic[id] ?? []),
    ).toBe(false);
  });
});
