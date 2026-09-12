import type { RelationType } from "@/generated/prisma/enums";

/**
 * Relations are stored once, in a canonical direction, and inverted for
 * display. Writing mirrored rows would double every write and let the two
 * halves diverge.
 *
 * `forward` is how the SOURCE radar describes the edge; `inverse` is how the
 * TARGET describes the same row.
 */
export const RELATION_META: Record<
  RelationType,
  { forward: string; inverse: string; symmetric: boolean }
> = {
  DUPLICATE_OF: {
    forward: "Duplicate of",
    inverse: "Has duplicate",
    symmetric: false,
  },
  RELATED_TO: { forward: "Related to", inverse: "Related to", symmetric: true },
  BLOCKS: { forward: "Blocks", inverse: "Blocked by", symmetric: false },
  PARENT_OF: { forward: "Parent of", inverse: "Child of", symmetric: false },
  CLONE_OF: { forward: "Clone of", inverse: "Cloned to", symmetric: false },
  CAUSED_BY: { forward: "Caused by", inverse: "Causes", symmetric: false },
};

export const RELATION_TYPES = Object.keys(RELATION_META) as RelationType[];

export function isSymmetric(type: RelationType): boolean {
  return RELATION_META[type].symmetric;
}

/** The label to show when viewing this edge from the target's side. */
export function invertRelation(type: RelationType): string {
  return RELATION_META[type].inverse;
}

export function relationLabel(type: RelationType, fromSource: boolean): string {
  return fromSource ? RELATION_META[type].forward : RELATION_META[type].inverse;
}

/**
 * Symmetric edges must be stored in a stable order, otherwise
 * @@unique([sourceId, targetId, type]) lets A-relates-B and B-relates-A both
 * exist as separate rows.
 */
export function normalizeSymmetric(
  sourceId: string,
  targetId: string,
  type: RelationType,
): { sourceId: string; targetId: string } {
  if (isSymmetric(type) && sourceId > targetId) {
    return { sourceId: targetId, targetId: sourceId };
  }
  return { sourceId, targetId };
}

/**
 * Resolve an edge relative to the radar being viewed: which radar is "the
 * other one", and what to call the relationship from here.
 */
export function orientRelation<T>(
  edge: { sourceId: string; targetId: string; type: RelationType },
  viewerRadarId: string,
  pick: (id: string) => T,
): { other: T; label: string; fromSource: boolean } {
  const fromSource = edge.sourceId === viewerRadarId;
  return {
    other: pick(fromSource ? edge.targetId : edge.sourceId),
    label: relationLabel(edge.type, fromSource),
    fromSource,
  };
}

/**
 * Hierarchical edges must not form a cycle — a radar that is its own
 * ancestor makes the tree view and any recursive rollup hang. Walks up from
 * `candidateParentId` looking for `childId`.
 */
export async function wouldCreateCycle(
  childId: string,
  candidateParentId: string,
  parentsOf: (id: string) => Promise<string[]>,
): Promise<boolean> {
  if (childId === candidateParentId) return true;
  const seen = new Set<string>([candidateParentId]);
  const queue = [candidateParentId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const parent of await parentsOf(current)) {
      if (parent === childId) return true;
      if (!seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return false;
}
