import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { MILESTONE_STATUS_LABEL, MILESTONE_STATUS_TONE } from "@/lib/radar/taxonomy";
import { compactDate } from "@/lib/radar/format";
import { requireUser } from "@/server/guards";
import { getMilestones } from "@/server/radars/queries";
import { getMilestoneProgress } from "@/server/milestones/queries";
import { ToneBadge } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Milestones" };

export default async function MilestonesPage() {
  await requireUser();
  const milestones = await getMilestones();
  const progress = await Promise.all(
    milestones.map((m) => getMilestoneProgress(m.id)),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Milestones</h1>
        <Button
          render={<Link href="/settings/milestones" />}
          nativeButton={false}
          size="sm"
        >
          <Plus /> New milestone
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
          No milestones yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {milestones.map((milestone, index) => {
            const stats = progress[index];
            return (
              <li key={milestone.id}>
                <Link
                  href={`/milestones/${milestone.id}`}
                  className="hover:bg-muted/40 block rounded-lg border p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{milestone.name}</span>
                    <ToneBadge tone={MILESTONE_STATUS_TONE[milestone.status]}>
                      {MILESTONE_STATUS_LABEL[milestone.status]}
                    </ToneBadge>
                    {milestone.targetDate && (
                      <span className="text-muted-foreground text-xs">
                        due {compactDate(milestone.targetDate)}
                      </span>
                    )}
                    <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                      {stats.closed}/{stats.total}
                    </span>
                  </div>

                  <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-foreground h-full rounded-full"
                      style={{ width: `${stats.percent}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
