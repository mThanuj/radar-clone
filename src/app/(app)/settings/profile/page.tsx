import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/server/guards";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const current = await requireUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: current.id },
    select: { name: true, handle: true, email: true, jobTitle: true },
  });

  return <ProfileForm user={user} />;
}
