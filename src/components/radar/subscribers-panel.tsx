"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Bell, BellOff, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { RadarDetail } from "@/server/radars/queries";
import {
  addSubscriberAction,
  removeSubscriberAction,
  setSubscriptionMutedAction,
} from "@/server/subscribers/actions";
import { UserChip } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function SubscribersPanel({
  radar,
  people,
  currentUserId,
}: {
  radar: RadarDetail;
  people: { id: string; name: string; handle: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  const cc = radar.subscribers.filter((s) => s.role === "CC");
  const watchers = radar.subscribers.filter((s) => s.role === "WATCHER");
  // Helpers are subscribers too, but they have their own field next to
  // Assignee — listing them again here would be the same names twice.
  const listed = cc.length + watchers.length;

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    removed?: string,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      // Removing a row unmounts the button that was focused, dropping focus to
      // <body>. Send it to the heading and say what happened.
      if (removed) {
        heading.current?.focus();
        toast.success(`${removed} removed`);
      }
    });
  }

  const alreadyOn = new Set(radar.subscribers.map((s) => s.user.id));
  const candidates = people.filter(
    (p) =>
      !alreadyOn.has(p.id) &&
      (p.name.toLowerCase().includes(term.toLowerCase()) ||
        p.handle.toLowerCase().includes(term.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3
          ref={heading}
          tabIndex={-1}
          className="text-muted-foreground text-xs font-medium outline-none"
        >
          CC &amp; watchers
        </h3>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label="Add person">
                <Plus />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-60 p-0">
            <input
              autoFocus
              aria-label="Search people"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search people…"
              className="focus-visible:ring-ring h-8 w-full border-b bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset"
            />
            <div className="max-h-56 overflow-y-auto p-1">
              {candidates.map((person) => (
                <div
                  key={person.id}
                  className="hover:bg-muted flex items-center gap-1 rounded px-2 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <button
                    aria-label={`CC ${person.name}`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                    onClick={() => {
                      setOpen(false);
                      run(() =>
                        addSubscriberAction({
                          radarId: radar.id,
                          number: radar.number,
                          userId: person.id,
                          role: "CC",
                        }),
                      );
                    }}
                  >
                    CC
                  </button>
                  <button
                    aria-label={`Watch ${person.name}`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                    onClick={() => {
                      setOpen(false);
                      run(() =>
                        addSubscriberAction({
                          radarId: radar.id,
                          number: radar.number,
                          userId: person.id,
                          role: "WATCHER",
                        }),
                      );
                    }}
                  >
                    Watch
                  </button>
                </div>
              ))}
              {candidates.length === 0 && (
                <p className="text-muted-foreground p-2 text-xs">
                  Everyone is already subscribed.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {[
        { label: "CC", rows: cc },
        { label: "Watching", rows: watchers },
      ].map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[0.7rem] uppercase">
              {group.label}
            </span>
            {group.rows.map((subscriber) => (
              <div
                key={subscriber.id}
                className="group flex items-center gap-1 py-0.5"
              >
                <UserChip person={subscriber.user} className="min-w-0 flex-1" />
                {subscriber.user.id === currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      subscriber.muted
                        ? `Unmute notifications for ${subscriber.user.name}`
                        : `Mute notifications for ${subscriber.user.name}`
                    }
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setSubscriptionMutedAction({
                          subscriberId: subscriber.id,
                          number: radar.number,
                          muted: !subscriber.muted,
                        }),
                      )
                    }
                  >
                    {subscriber.muted ? <BellOff /> : <Bell />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${subscriber.user.name}`}
                  disabled={pending}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={() =>
                    run(
                      () =>
                        removeSubscriberAction({
                          subscriberId: subscriber.id,
                          radarId: radar.id,
                          number: radar.number,
                        }),
                      subscriber.user.name,
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        ),
      )}

      {listed === 0 && (
        <p className="text-muted-foreground text-xs">Nobody yet.</p>
      )}
    </div>
  );
}
