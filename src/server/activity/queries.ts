import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const EVENT_SELECT = {
  id: true,
  kind: true,
  note: true,
  createdAt: true,
  actor: { select: { id: true, name: true, handle: true, image: true } },
  changes: {
    select: {
      id: true,
      field: true,
      fromValue: true,
      toValue: true,
      fromLabel: true,
      toLabel: true,
    },
  },
  comment: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
      author: { select: { id: true, name: true, handle: true, image: true } },
    },
  },
} satisfies Prisma.ActivityEventSelect;

export type FeedEvent = Prisma.ActivityEventGetPayload<{
  select: typeof EVENT_SELECT;
}>;

/**
 * Per-radar feed, oldest first — a radar reads like a conversation.
 *
 * Keyed by number rather than id so the detail page can start it alongside the
 * radar lookup instead of after it. Waiting for the id first made this the
 * second leg of a waterfall behind the heaviest query on the page, for no
 * reason: the number is already in the URL.
 */
export async function getFeed(radarNumber: number, take = 200) {
  return db.activityEvent.findMany({
    where: { radar: { number: radarNumber } },
    orderBy: { createdAt: "asc" },
    take,
    select: EVENT_SELECT,
  });
}

export type TimelineFilters = {
  actorId?: string;
};

export type TimelineEvent = Prisma.ActivityEventGetPayload<{
  select: typeof EVENT_SELECT & {
    radar: { select: { number: true; title: true; state: true; substate: true } };
  };
}>;

/**
 * The global timeline: the same table without a radarId filter, newest first,
 * cursor-paginated so "load more" never re-reads what you have.
 */
export async function getTimeline(args: {
  cursor?: string;
  take?: number;
  filters?: TimelineFilters;
}) {
  const take = args.take ?? 60;
  const where: Prisma.ActivityEventWhereInput = {};
  if (args.filters?.actorId) where.actorId = args.filters.actorId;

  const events = await db.activityEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: {
      ...EVENT_SELECT,
      radar: {
        select: { number: true, title: true, state: true, substate: true },
      },
    },
  });

  const hasMore = events.length > take;
  return {
    events: hasMore ? events.slice(0, take) : events,
    nextCursor: hasMore ? events[take - 1].id : null,
  };
}

/** People who have done anything — the timeline's actor filter. */
export async function getTimelineActors() {
  const rows = await db.activityEvent.findMany({
    where: { actorId: { not: null } },
    distinct: ["actorId"],
    select: { actor: { select: { id: true, name: true, handle: true } } },
    take: 50,
  });
  return rows
    .map((r) => r.actor)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
}
