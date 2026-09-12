import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { toSearchParams } from "@/lib/search/url";
import { toPrismaWhere } from "@/lib/search/to-prisma";
import { parseSearchParams } from "@/lib/search/url";
import {
  DEFAULT_COLUMNS,
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  type RadarQuery,
} from "@/lib/search/types";

const q = (partial: Partial<RadarQuery>): string =>
  toSearchParams({
    conditions: [],
    sort: DEFAULT_SORT,
    group: null,
    columns: DEFAULT_COLUMNS,
    page: 1,
    perPage: DEFAULT_PER_PAGE,
    ...partial,
  }).toString();

/**
 * The standard Radar queues. They're SavedQuery rows rather than hardcoded
 * views, so you can rename them, re-pin them, or edit what they mean —
 * and "save current search" produces something indistinguishable.
 *
 * `me` is resolved per request by the field registry, so one row works for
 * every user.
 */
export const DEFAULT_QUERIES = [
  {
    name: "My Open Radars",
    icon: "inbox",
    isPinned: true,
    sortOrder: 0,
    params: q({
      conditions: [
        { field: "assignee", op: "in", values: ["me"] },
        { field: "state", op: "in", values: ["ANALYZE", "INTEGRATE", "VERIFY"] },
      ],
      sort: [{ field: "priority", dir: "asc" }],
    }),
  },
  {
    name: "Assigned to Me",
    icon: "user",
    isPinned: true,
    sortOrder: 1,
    params: q({ conditions: [{ field: "assignee", op: "in", values: ["me"] }] }),
  },
  {
    name: "Originated by Me",
    icon: "pen",
    isPinned: true,
    sortOrder: 2,
    params: q({ conditions: [{ field: "originator", op: "in", values: ["me"] }] }),
  },
  {
    name: "Watching",
    icon: "eye",
    isPinned: true,
    sortOrder: 3,
    params: q({ conditions: [{ field: "watching", op: "in", values: ["me"] }] }),
  },
  {
    name: "Unassigned",
    icon: "circle-dashed",
    isPinned: false,
    sortOrder: 4,
    params: q({
      conditions: [
        { field: "assignee", op: "isNotSet", values: [] },
        { field: "state", op: "in", values: ["ANALYZE", "INTEGRATE", "VERIFY"] },
      ],
    }),
  },
  {
    name: "Recently Closed",
    icon: "check",
    isPinned: false,
    sortOrder: 5,
    params: q({
      conditions: [{ field: "state", op: "in", values: ["CLOSED"] }],
      sort: [{ field: "resolvedAt", dir: "desc" }],
    }),
  },
] as const;

/**
 * Lazily install the default queues the first time someone looks. Cheaper
 * than an auth hook and self-healing if a user deletes them all and wants
 * them back (they just sign in again with none present... deliberately not
 * re-created once any query exists).
 */
async function ensureDefaults(userId: string) {
  const existing = await db.savedQuery.count({ where: { ownerId: userId } });
  if (existing > 0) return;
  await db.savedQuery.createMany({
    data: DEFAULT_QUERIES.map((preset) => ({ ...preset, ownerId: userId })),
    skipDuplicates: true,
  });
}

export const getSavedQueries = cache(async (userId: string) => {
  await ensureDefaults(userId);
  return db.savedQuery.findMany({
    where: { OR: [{ ownerId: userId }, { visibility: "SHARED" }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      params: true,
      icon: true,
      isPinned: true,
      visibility: true,
      ownerId: true,
    },
  });
});

export async function getSavedQuery(id: string) {
  return db.savedQuery.findUnique({ where: { id } });
}

/** Live counts for the pinned queues in the sidebar. */
export async function countForSavedQuery(params: string, userId: string) {
  const { query } = parseSearchParams(new URLSearchParams(params));
  return db.radar.count({ where: toPrismaWhere(query, { userId }) });
}
