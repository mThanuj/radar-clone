"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck, Circle } from "lucide-react";
import { cn } from "cn";
import type { NotificationReason, RadarState, RadarSubstate } from "@/generated/prisma/enums";
import { REASONS } from "@/lib/notifications/catalog";
import { relativeTime } from "@/lib/radar/format";
import {
  markAllReadAction,
  setNotificationReadAction,
} from "@/server/notifications/actions";
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
  const [pending, startTransition] = useTransition();

  function toggleRead(id: string, read: boolean) {
    startTransition(async () => {
      await setNotificationReadAction({ id, read });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Inbox</h1>
        <Button
          variant="outline"
          size="xs"
          disabled={pending || items.every((i) => i.readAt)}
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
                !item.readAt && "bg-primary/5",
              )}
            >
              <button
                aria-label={item.readAt ? "Mark unread" : "Mark read"}
                onClick={() => toggleRead(item.id, !item.readAt)}
                className="shrink-0"
              >
                <Circle
                  className={cn(
                    "size-2.5",
                    item.readAt
                      ? "text-muted-foreground/40"
                      : "fill-primary text-primary",
                  )}
                />
              </button>

              <span className="text-muted-foreground hidden w-32 shrink-0 text-xs sm:block">
                {REASONS[item.reason].label}
              </span>

              <Link
                href={`/radars/${item.radar.number}`}
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
