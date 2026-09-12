import { Suspense } from "react";
import { CommandPalette } from "@/components/layout/command-palette";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/server/guards";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex h-dvh overflow-hidden">
      <Suspense fallback={<div className="bg-sidebar w-60 shrink-0 border-r" />}>
        <Sidebar user={user} />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      <Suspense>
        <CommandPalette />
      </Suspense>
      <KeyboardShortcuts />
    </div>
  );
}
