import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { toPrismaOrderBy, toPrismaWhere } from "@/lib/search/to-prisma";
import type { OptionSources } from "@/lib/search/fields";
import type { QueryContext, RadarQuery } from "@/lib/search/types";

/** Columns needed by the result table, whatever subset is displayed. */
const ROW_SELECT = {
  id: true,
  number: true,
  title: true,
  state: true,
  substate: true,
  classification: true,
  reproducibility: true,
  priority: true,
  isRegression: true,
  createdAt: true,
  updatedAt: true,
  lastActivityAt: true,
  stateChangedAt: true,
  resolvedAt: true,
  dueDate: true,
  assignee: { select: { id: true, name: true, handle: true, image: true } },
  originator: { select: { id: true, name: true, handle: true, image: true } },
  component: { select: { id: true, name: true, path: true } },
  milestone: { select: { id: true, name: true } },
} satisfies Prisma.RadarSelect;

export type RadarRow = Prisma.RadarGetPayload<{ select: typeof ROW_SELECT }>;

export async function searchRadars(query: RadarQuery, ctx: QueryContext) {
  const where = toPrismaWhere(query, ctx);
  const [rows, total] = await Promise.all([
    db.radar.findMany({
      where,
      orderBy: toPrismaOrderBy(query),
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: ROW_SELECT,
    }),
    db.radar.count({ where }),
  ]);
  return { rows, total };
}

/** Board columns: the open states, each capped so one column can't blow up. */
export async function boardData(
  query: RadarQuery,
  ctx: QueryContext,
  limitPerColumn = 100,
) {
  const base = toPrismaWhere(query, ctx);
  const states = ["ANALYZE", "INTEGRATE", "VERIFY", "CLOSED"] as const;

  const columns = await Promise.all(
    states.map(async (state) => {
      const where: Prisma.RadarWhereInput = { AND: [base, { state }] };
      const [rows, total] = await Promise.all([
        db.radar.findMany({
          where,
          orderBy: [{ priority: "asc" }, { lastActivityAt: "desc" }],
          take: limitPerColumn,
          select: ROW_SELECT,
        }),
        db.radar.count({ where }),
      ]);
      return { state, rows, total };
    }),
  );

  return columns;
}

const DETAIL_INCLUDE = {
  component: { select: { id: true, name: true, path: true } },
  milestone: { select: { id: true, name: true, status: true, targetDate: true } },
  assignee: { select: { id: true, name: true, handle: true, image: true } },
  originator: { select: { id: true, name: true, handle: true, image: true } },
  duplicateOf: { select: { id: true, number: true, title: true, state: true } },
  duplicates: {
    select: { id: true, number: true, title: true, state: true, substate: true },
    orderBy: { number: "asc" },
  },
  subscribers: {
    select: {
      id: true,
      role: true,
      muted: true,
      user: { select: { id: true, name: true, handle: true, image: true } },
    },
    orderBy: { addedAt: "asc" },
  },
  outgoing: {
    select: {
      id: true,
      type: true,
      note: true,
      sourceId: true,
      targetId: true,
      target: {
        select: { id: true, number: true, title: true, state: true, substate: true },
      },
    },
  },
  incoming: {
    select: {
      id: true,
      type: true,
      note: true,
      sourceId: true,
      targetId: true,
      source: {
        select: { id: true, number: true, title: true, state: true, substate: true },
      },
    },
  },
} satisfies Prisma.RadarInclude;

export type RadarDetail = Prisma.RadarGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Deduped per request: the layout, the page, and the tab bar all ask for the
 * same radar, and React cache() collapses that into one query.
 */
export const getRadarByNumber = cache(async (number: number) => {
  if (!Number.isFinite(number)) return null;
  return db.radar.findUnique({
    where: { number },
    include: DETAIL_INCLUDE,
  });
});

/** Vocabulary for the filter bar and the pickers. */
export const getOptionSources = cache(async (): Promise<OptionSources> => {
  const [components, users, milestones] = await Promise.all([
    db.component.findMany({
      where: { isActive: true },
      orderBy: { path: "asc" },
      select: { id: true, path: true },
    }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, handle: true },
    }),
    db.milestone.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return {
    component: components.map((c) => ({ value: c.id, label: c.path })),
    user: users.map((u) => ({ value: u.id, label: `${u.name} (@${u.handle})` })),
    milestone: milestones.map((m) => ({ value: m.id, label: m.name })),
  };
});

/** Full component/version tree for the create form's dependent dropdowns. */
export const getComponentTree = cache(async () =>
  db.component.findMany({
    where: { isActive: true },
    orderBy: { path: "asc" },
    select: {
      id: true,
      name: true,
      path: true,
      depth: true,
      parentId: true,
      defaultAssigneeId: true,
      _count: { select: { radars: true } },
    },
  }),
);

export const getPeople = cache(async () =>
  db.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, handle: true, image: true },
  }),
);

export const getMilestones = cache(async () =>
  db.milestone.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      targetDate: true,
      component: { select: { id: true, path: true } },
      _count: { select: { radars: true } },
    },
  }),
);

/** Typeahead for the Cmd+K palette and relation pickers. */
export async function findRadars(term: string, limit = 8) {
  const asNumber = Number(term);
  return db.radar.findMany({
    where: Number.isFinite(asNumber) && term.trim() !== ""
      ? {
          OR: [
            { number: asNumber },
            { title: { contains: term, mode: "insensitive" } },
          ],
        }
      : { title: { contains: term, mode: "insensitive" } },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    select: {
      id: true,
      number: true,
      title: true,
      state: true,
      substate: true,
      priority: true,
    },
  });
}
