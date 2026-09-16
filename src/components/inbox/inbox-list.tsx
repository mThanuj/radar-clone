"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck, Circle } from "lucide-react";
import { cn } from "cn";
import type { NotificationReason, RadarState, RadarSubstate } from "@/generated/prisma/enums";
import { REASONS } from "@/lib/notifications/catalog";
import { relativeTime } from "@/lib/radar/format";
import {
  markAllReadAction,
  setNotificationReadAction,
} from "@/server/notifications/actions";
import { useMarkRead } from "@/components/notifications/notification-provider";
import { PriorityBadge, StateBadge } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  reason: NotificationReason;
  readAt: Date | null;
  createdAt: Date;
  radar: {
    number: number;
    title: string;
    state: RadarState;
    substate: RadarSubstate;
    priority: number;
  };
};

export function InboxList({ items }: { items: Item[] }) {
  const router = useRouter();
  const markReadInBadge = useMarkRead();
  const [pending, startTransition] = useTransition();
  // Rows marked read by opening them. Kept locally because opening a radar
  // navigates away from this page: there is no server render to wait for, and
  // on a ⌘-click — which stays here — the dot has to settle anyway.
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const isRead = (item: Item) => Boolean(item.readAt) || opened.has(item.id);

  function toggleRead(id: string, read: boolean) {
    // Hand this row back to the server value, whichever way it is going —
    // otherwise an opened row could never be marked unread again.
    setOpened((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    startTransition(async () => {
      await setNotificationReadAction({ id, read });
      router.refresh();
    });
  }

  /** Opening a notification is reading it. */
  function open(item: Item) {
    if (isRead(item)) return;
    setOpened((current) => new Set(current).add(item.id));
    markReadInBadge();
    startTransition(async () => {
      await setNotificationReadAction({ id: item.id, read: true });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Inbox</h1>
        <Button
          variant="outline"
          size="xs"
          disabled={pending || items.every(isRead)}
          onClick={() =>
            startTransition(async () => {
              await markAllReadAction();
              router.refresh();
            })
          }
        >
          <CheckCheck /> Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
          Nothing here. You&apos;ll be notified when a radar you&apos;re on
          changes.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                !isRead(item) && "bg-primary/5",
              )}
            >
              <button
                aria-label={isRead(item) ? "Mark unread" : "Mark read"}
                aria-pressed={!isRead(item)}
                onClick={() => toggleRead(item.id, !isRead(item))}
                className="focus-visible:ring-ring rounded-full shrink-0 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              >
                <Circle
                  className={cn(
                    "size-2.5",
                    // /40 put this at 1.7:1 — below the 3:1 a graphic needs,
                    // and it is the only signal of read state as well as the
                    // hit target for changing it.
                    isRead(item)
                      ? "text-muted-foreground"
                      : "fill-primary text-primary",
                  )}
                />
              </button>

              <span className="text-muted-foreground hidden w-32 shrink-0 text-xs sm:block">
                {REASONS[item.reason].label}
              </span>
              {/* The column is dropped below sm for space, but the reason is
                  the only thing saying why this radar is in your inbox. */}
              <span className="sr-only sm:hidden">
                {REASONS[item.reason].label}
              </span>

              <Link
                href={`/radars/${item.radar.number}`}
                onClick={() => open(item)}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {item.radar.number}
                </span>{" "}
                {item.radar.title}
              </Link>

              <span className="hidden sm:contents">
                <PriorityBadge priority={item.radar.priority} />
                <StateBadge state={item.radar.state} />
              </span>

              <time className="text-muted-foreground w-16 shrink-0 text-right text-xs sm:w-24">
                {relativeTime(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
