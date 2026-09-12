import type { Metadata } from "next";
import { CreateRadarForm } from "@/components/radar/create-form";
import { requireUser } from "@/server/guards";
import {
  getComponentTree,
  getKeywords,
  getMilestones,
  getPeople,
} from "@/server/radars/queries";

export const metadata: Metadata = { title: "File a radar" };

export default async function NewRadarPage() {
  await requireUser();
  const [components, people, milestones, keywords] = await Promise.all([
    getComponentTree(),
    getPeople(),
    getMilestones(),
    getKeywords(),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-base font-semibold">File a radar</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        It opens in Analyze / Open and lands on whoever owns the component
        unless you say otherwise.
      </p>
      <CreateRadarForm
        components={components}
        people={people}
        milestones={milestones}
        keywords={keywords}
      />
    </div>
  );
}
