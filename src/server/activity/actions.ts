"use server";

import { requireUser } from "@/server/guards";
import { getTimeline, type TimelineFilters } from "@/server/activity/queries";

export async function loadTimelineAction(input: {
  cursor?: string;
  filters?: TimelineFilters;
}) {
  await requireUser();
  const { events, nextCursor } = await getTimeline({
    cursor: input.cursor,
    filters: input.filters,
  });
  // Dates survive the server-action boundary; no manual serialization needed.
  return { events, nextCursor };
}
