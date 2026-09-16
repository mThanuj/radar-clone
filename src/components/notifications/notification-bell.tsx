"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "cn";
import { REASONS } from "@/lib/notifications/catalog";
import { relativeTime } from "@/lib/radar/format";
import type { NotificationReason } from "@/generated/prisma/enums";
import {
  markAllReadAction,
  recentNotificationsAction,
} from "@/server/notifications/actions";
import { useUnreadCount } from "@/components/notifications/notification-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Item = {
  id: string;
  reason: string;
  readAt: Date | string | null;
  createdAt: Date | string;
  radarNumber: number;
  radarTitle: string;
};

export function NotificationBell() {
  const router = useRouter();
  const unreadCount = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      setItems(await recentNotificationsAction());
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          >
            <span className="relative">
              <Bell />
              {/* Colour-only cue for sighted users; the count above carries it
                  for everyone else. */}
              {unreadCount > 0 && (
                <span className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
              )}
            </span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <header className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            Notifications
            {unreadCount > 0 && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                {unreadCount} unread
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={pending || unreadCount === 0}
            onClick={() =>
              startTransition(async () => {
                await markAllReadAction();
                load();
                router.refresh();
              })
            }
          >
            <CheckCheck /> Read all
          </Button>
        </header>

        <div className="max-h-96 overflow-y-auto" aria-busy={pending}>
          {items.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm" role="status">
              {pending ? "Loading…" : "Nothing yet."}
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/radars/${item.radarNumber}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "hover:bg-muted/60 block px-3 py-2",
                      !item.readAt && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">
                        {REASONS[item.reason as NotificationReason]?.label ??
                          "Update"}
                      </span>
                      <time className="text-muted-foreground shrink-0 text-[0.7rem]">
                        {relativeTime(item.createdAt)}
                      </time>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      <span className="font-mono tabular-nums">
                        {item.radarNumber}
                      </span>{" "}
                      {item.radarTitle}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t p-1">
          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="hover:bg-muted block rounded px-2 py-1.5 text-center text-xs"
          >
            Open inbox
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
