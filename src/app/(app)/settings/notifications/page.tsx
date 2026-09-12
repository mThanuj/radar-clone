import type { Metadata } from "next";
import { NotificationPrefs } from "@/components/settings/notification-prefs";
import { requireUser } from "@/server/guards";
import { getNotificationSettings } from "@/server/notifications/preferences";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const settings = await getNotificationSettings(user.id);

  return (
    <NotificationPrefs
      emailEnabled={settings.emailEnabled}
      categories={settings.categories}
    />
  );
}
