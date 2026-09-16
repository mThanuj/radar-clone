import { NavLink } from "@/components/layout/nav-link";
import { Bell, Boxes, Target, User } from "lucide-react";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-5">
      <h1 className="text-base font-semibold">Settings</h1>

      <nav
        aria-label="Settings"
        className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2"
      >
        <NavLink href="/settings/profile" icon={<User />} label="Profile" />
        <NavLink href="/settings/notifications" icon={<Bell />} label="Notifications" />
        <NavLink href="/settings/components" icon={<Boxes />} label="Components" />
        <NavLink href="/settings/milestones" icon={<Target />} label="Milestones" />
      </nav>

      {children}
    </div>
  );
}
