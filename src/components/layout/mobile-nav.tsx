"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Radar as RadarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Mobile top bar with a drawer holding the same navigation the desktop rail
 * shows — passed in as children, so it stays server-rendered and the two can't
 * drift apart.
 *
 * Only rendered below md; the rail takes over above it.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Tapping a link should navigate *and* get out of the way — without this the
  // drawer stays open over the page you just asked for. Closed during render
  // rather than in an effect, which is React's documented way to react to a
  // prop or value changing.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  return (
    <header className="bg-background sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
              <Menu />
            </Button>
          }
        />
        <SheetContent
          side="left"
          className="bg-sidebar flex w-[17rem] flex-col gap-3 px-2 py-3"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
          <RadarIcon className="size-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Radar</span>
      </div>
    </header>
  );
}
