import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import {
  DESCRIPTION_SECTIONS,
  renderCanonicalText,
  type DescriptionSectionKey,
} from "@/lib/radar/description";
import { resolutionOf } from "@/lib/radar/state-machine";
import { SUBSTATE_LABEL } from "@/lib/radar/taxonomy";
import { getFeed, type FeedEvent } from "@/server/activity/queries";
import { requireUser } from "@/server/guards";
import {
  getComponentTree,
  getMilestones,
  getPeople,
  getRadarByNumber,
} from "@/server/radars/queries";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { CommentComposer } from "@/components/activity/comment-composer";
import { Markdown } from "@/components/markdown";
import { StateBadge } from "@/components/radar/badges";
import { CloseDuplicateDialog } from "@/components/radar/close-duplicate-dialog";
import { DescriptionPanel } from "@/components/radar/description-panel";
import { DetailSidebar } from "@/components/radar/detail-sidebar";
import { RelationsPanel } from "@/components/radar/relations-panel";
import { SubscribersPanel } from "@/components/radar/subscribers-panel";
import {
  CopyRdarButton,
  CopyTextButton,
  EditableTitle,
} from "@/components/radar/title-controls";

export async function generateMetadata({
  params,
}: PageProps<"/radars/[number]">): Promise<Metadata> {
  const { number } = await params;
  const radar = await getRadarByNumber(Number(number));
  return { title: radar ? `${radar.number} — ${radar.title}` : "Radar" };
}

export default async function RadarDetailPage({
  params,
}: PageProps<"/radars/[number]">) {
  const user = await requireUser();
  const { number } = await params;
  const radarNumber = Number(number);

  // Nothing below depends on the radar row, so it all starts now rather than
  // after it returns. The feed is keyed by number for exactly this reason:
  // waiting for radar.id put the heaviest query on the page in front of it.
  const feedPromise = getFeed(radarNumber);
  const peoplePromise = getPeople();
  const componentsPromise = getComponentTree();
  const milestonesPromise = getMilestones();

  // notFound() below abandons the feed mid-flight; a handler keeps a database
  // error there from surfacing as an unhandled rejection instead of the real
  // failure, which getRadarByNumber is about to report anyway.
  void feedPromise.catch(() => {});

  const radar = await getRadarByNumber(radarNumber);
  if (!radar) notFound();

  const [people, components, milestones] = await Promise.all([
    peoplePromise,
    componentsPromise,
    milestonesPromise,
  ]);

  const values = Object.fromEntries(
    DESCRIPTION_SECTIONS.map((s) => [s.key, radar[s.key]]),
  ) as Record<DescriptionSectionKey, string | null>;

  const filled = DESCRIPTION_SECTIONS.filter((s) => values[s.key]?.trim());
  const resolution = resolutionOf(radar);

  return (
    <div className="mx-auto flex max-w-[80rem] flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CopyRdarButton number={radar.number} />
          <StateBadge state={radar.state} substate={radar.substate} />
          {resolution && (
            <span className="text-muted-foreground text-xs">
              Resolution: {SUBSTATE_LABEL[resolution]}
            </span>
          )}
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <CopyTextButton text={renderCanonicalText({ ...radar, ...values })} />
            <CloseDuplicateDialog
              radarId={radar.id}
              number={radar.number}
              version={radar.version}
            />
          </span>
        </div>

        <EditableTitle
          radar={{ id: radar.id, number: radar.number, version: radar.version }}
          title={radar.title}
        />

        {radar.duplicateOf && (
          <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <AlertTriangle className="text-destructive size-4" />
            <span>
              Duplicate of{" "}
              <Link
                href={`/radars/${radar.duplicateOf.number}`}
                className="font-medium underline underline-offset-2"
              >
                {radar.duplicateOf.number} — {radar.duplicateOf.title}
              </Link>
            </span>
          </div>
        )}

        {radar.duplicates.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {radar.duplicates.length} radar
            {radar.duplicates.length === 1 ? "" : "s"} closed as duplicates of
            this one.
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <DescriptionPanel
            radar={{
              id: radar.id,
              number: radar.number,
              version: radar.version,
            }}
            values={values}
          >
            {filled.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No description yet.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {filled.map((section) => (
                  <div key={section.key}>
                    <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                      {section.label}
                    </h3>
                    <Markdown>{values[section.key] ?? ""}</Markdown>
                  </div>
                ))}
              </div>
            )}
          </DescriptionPanel>

          <RelationsPanel radar={radar} />

          <section className="rounded-lg border">
            <header className="border-b px-4 py-2">
              <h2 className="text-sm font-medium">Activity</h2>
            </header>
            <div className="px-4">
              {/* Streamed: the radar itself is what people came for, and the
                  feed grows without bound while the rest of the page doesn't. */}
              <Suspense fallback={<ActivitySkeleton />}>
                <Activity
                  events={feedPromise}
                  radarNumber={radar.number}
                  currentUserId={user.id}
                />
              </Suspense>
            </div>
            <div className="border-t p-4">
              <CommentComposer
                radarId={radar.id}
                number={radar.number}
                people={people}
              />
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border p-3">
            <DetailSidebar
              radar={radar}
              people={people}
              components={components}
              milestones={milestones}
            />
          </div>

          <div className="rounded-lg border p-3">
            <SubscribersPanel
              radar={radar}
              people={people}
              currentUserId={user.id}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

async function Activity({
  events,
  radarNumber,
  currentUserId,
}: {
  events: Promise<FeedEvent[]>;
  radarNumber: number;
  currentUserId: string;
}) {
  return (
    <ActivityFeed
      events={await events}
      radarNumber={radarNumber}
      currentUserId={currentUserId}
    />
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-3 py-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="bg-muted h-3 w-40 animate-pulse rounded" />
            <div className="bg-muted h-10 animate-pulse rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
