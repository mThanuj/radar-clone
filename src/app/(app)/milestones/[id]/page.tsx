import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { RadarState } from "@/generated/prisma/enums";
import { MILESTONE_STATUS_LABEL, MILESTONE_STATUS_TONE } from "@/lib/radar/taxonomy";
import { ALL_STATES } from "@/lib/radar/state-machine";
import { fullDate } from "@/lib/radar/format";
import { requireUser } from "@/server/guards";
import {
  getMilestone,
  getMilestoneBurnup,
  getMilestoneProgress,
} from "@/server/milestones/queries";
import { BurnupChart } from "@/components/milestone/burnup-chart";
import { StateBadge, ToneBadge } from "@/components/radar/badges";

export async function generateMetadata({
  params,
}: PageProps<"/milestones/[id]">): Promise<Metadata> {
  const { id } = await params;
  const milestone = await getMilestone(id);
  return { title: milestone?.name ?? "Milestone" };
}

/** A single headline number is a stat tile, not a chart. */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function MilestonePage({
  params,
}: PageProps<"/milestones/[id]">) {
  await requireUser();
  const { id } = await params;

  const milestone = await getMilestone(id);
  if (!milestone) notFound();

  const [progress, burnup] = await Promise.all([
    getMilestoneProgress(id),
    getMilestoneBurnup(id),
  ]);

  const byState = new Map(progress.byState.map((s) => [s.state, s.count]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5">
      <header className="flex flex-col gap-1">
        <Link
          href="/milestones"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Milestones
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{milestone.name}</h1>
          <ToneBadge tone={MILESTONE_STATUS_TONE[milestone.status]}>
            {MILESTONE_STATUS_LABEL[milestone.status]}
          </ToneBadge>
        </div>
        {milestone.description && (
          <p className="text-muted-foreground text-sm">{milestone.description}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {milestone.component ? `${milestone.component.path} · ` : ""}
          {milestone.targetDate
            ? `Target ${fullDate(milestone.targetDate)}`
            : "No target date"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Complete" value={`${progress.percent}%`} />
        <Stat label="Closed" value={progress.closed} />
        <Stat label="Open" value={progress.open} />
        <Stat label="Total" value={progress.total} />
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Burnup</h2>
        <BurnupChart points={burnup} />
      </section>

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-2 text-sm font-medium">By state</h2>
        <ul className="divide-y">
          {ALL_STATES.map((state) => (
            <li key={state} className="flex items-center gap-3 px-4 py-2">
              <StateBadge state={state as RadarState} />
              <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                {byState.get(state) ?? 0}
              </span>
              <Link
                href={`/radars?milestone=${id}&state=${state}`}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/radars?milestone=${id}`}
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        All {progress.total} radars in this milestone →
      </Link>
    </div>
  );
}
