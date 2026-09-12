import { CommandPalette } from "@/components/layout/command-palette";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { Sidebar } from "@/components/layout/sidebar";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { requireUser } from "@/server/guards";
import { getUnreadCount } from "@/server/notifications/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // One cheap indexed count. Everything expensive in the sidebar streams.
  const unreadCount = await getUnreadCount(user.id);

  return (
    <NotificationProvider initialUnreadCount={unreadCount}>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar user={user} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        <CommandPalette />
        <KeyboardShortcuts />
      </div>
    </NotificationProvider>
  );
}
