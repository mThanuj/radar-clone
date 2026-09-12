import type { Metadata } from "next";
import { MilestonesAdmin } from "@/components/settings/milestones-admin";
import { requireUser } from "@/server/guards";
import { getComponentTree, getMilestones } from "@/server/radars/queries";

export const metadata: Metadata = { title: "Milestones" };

export default async function MilestoneSettingsPage() {
  await requireUser();
  const [milestones, components] = await Promise.all([
    getMilestones(),
    getComponentTree(),
  ]);

  return (
    <MilestonesAdmin
      milestones={milestones}
      components={components.map((c) => ({ id: c.id, path: c.path }))}
    />
  );
}
