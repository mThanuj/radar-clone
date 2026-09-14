import "server-only";
import { db } from "@/lib/db";

export type MilestoneProgress = {
  total: number;
  closed: number;
  open: number;
  byState: { state: string; count: number }[];
  percent: number;
};

export async function getMilestone(id: string) {
  return db.milestone.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      targetDate: true,
      component: { select: { id: true, path: true } },
    },
  });
}

export async function getMilestoneProgress(
  milestoneId: string,
): Promise<MilestoneProgress> {
  const grouped = await db.radar.groupBy({
    by: ["state"],
    where: { milestoneId },
    _count: { _all: true },
  });

  const byState = grouped.map((g) => ({
    state: g.state as string,
    count: g._count._all,
  }));
  const total = byState.reduce((sum, s) => sum + s.count, 0);
  const closed = byState.find((s) => s.state === "CLOSED")?.count ?? 0;

  return {
    total,
    closed,
    open: total - closed,
    byState,
    percent: total === 0 ? 0 : Math.round((closed / total) * 100),
  };
}

/**
 * Burnup series, built from the audit trail rather than a snapshot table:
 * every close is a FieldChange with field='state' and toValue='CLOSED', and
 * every reopen is one leaving CLOSED. Walking them in order reconstructs the
 * closed count on any given day — which is exactly why *Value stays
 * queryable instead of only storing display labels.
 */
export async function getMilestoneBurnup(milestoneId: string) {
  const [scope, events] = await Promise.all([
    db.radar.findMany({
      where: { milestoneId },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.fieldChange.findMany({
      where: {
        field: "state",
        event: { radar: { milestoneId } },
      },
      select: {
        fromValue: true,
        toValue: true,
        event: { select: { createdAt: true } },
      },
      orderBy: { event: { createdAt: "asc" } },
    }),
  ]);

  type Point = { date: string; scope: number; closed: number };
  const points = new Map<string, Point>();
  const day = (d: Date) => d.toISOString().slice(0, 10);

  let scopeCount = 0;
  let closedCount = 0;

  const touch = (date: string): Point => {
    const existing = points.get(date);
    if (existing) return existing;
    const point = { date, scope: scopeCount, closed: closedCount };
    points.set(date, point);
    return point;
  };

  for (const radar of scope) {
    scopeCount += 1;
    const point = touch(day(radar.createdAt));
    point.scope = scopeCount;
  }

  for (const change of events) {
    if (change.toValue === "CLOSED") closedCount += 1;
    else if (change.fromValue === "CLOSED") closedCount -= 1;
    else continue;
    const point = touch(day(change.event.createdAt));
    point.closed = closedCount;
    point.scope = Math.max(point.scope, scopeCount);
  }

  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
