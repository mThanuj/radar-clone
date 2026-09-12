import type { Metadata } from "next";
import { ComponentsAdmin } from "@/components/settings/components-admin";
import { requireUser } from "@/server/guards";
import { getComponentTree, getPeople } from "@/server/radars/queries";

export const metadata: Metadata = { title: "Components" };

export default async function ComponentSettingsPage() {
  await requireUser();
  const [components, people] = await Promise.all([
    getComponentTree(),
    getPeople(),
  ]);

  return <ComponentsAdmin components={components} people={people} />;
}
