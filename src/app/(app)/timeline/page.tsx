import Link from "next/link";
import type { Metadata } from "next";
import { TimelineList } from "@/components/activity/timeline-list";
import { getTimeline, getTimelineActors } from "@/server/activity/queries";
import { requireUser } from "@/server/guards";

export const metadata: Metadata = { title: "Timeline" };

export default async function TimelinePage({
  searchParams,
}: PageProps<"/timeline">) {
  await requireUser();
  const resolved = await searchParams;
  const actorId =
    typeof resolved.actor === "string" ? resolved.actor : undefined;

  const [{ events, nextCursor }, actors] = await Promise.all([
    getTimeline({ filters: { actorId } }),
    getTimelineActors(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Timeline</h1>
          <p className="text-muted-foreground text-sm">
            Everything that has moved, newest first.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/timeline"
            aria-current={actorId ? undefined : "true"}
            className={
              actorId
                ? "text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs"
                : "bg-muted rounded-md border px-2 py-1 text-xs font-medium"
            }
          >
            Everyone
          </Link>
          {actors.map((actor) => (
            <Link
              key={actor.id}
              href={`/timeline?actor=${actor.id}`}
              aria-current={actorId === actor.id ? "true" : undefined}
              className={
                actorId === actor.id
                  ? "bg-muted rounded-md border px-2 py-1 text-xs font-medium"
                  : "text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs"
              }
            >
              {actor.name}
            </Link>
          ))}
        </div>
      </div>

      <TimelineList
        initialEvents={events}
        initialCursor={nextCursor}
        filters={{ actorId }}
      />
    </div>
  );
}
