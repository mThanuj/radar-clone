"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  addSubscriberAction,
  removeSubscriberAction,
} from "@/server/subscribers/actions";
import { UserChip } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Helper = {
  id: string;
  user: { id: string; name: string; handle: string; image?: string | null };
};

/**
 * The people working a radar alongside its assignee.
 *
 * Sits under Assignee in the sidebar because that is the question it answers —
 * "who else is on this" — even though it writes subscriber rows rather than a
 * column on Radar. Adding someone here subscribes them, so they get the
 * radar's notifications from that moment on without a second step.
 */
export function HelpersField({
  radar,
  helpers,
  people,
  currentUserId,
}: {
  radar: { id: string; number: number };
  helpers: Helper[];
  people: { id: string; name: string; handle: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const group = useRef<HTMLDivElement>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, removed?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      // Removing a chip unmounts the button that had focus, dropping it to
      // <body>. Send it to the group, which is always here, and say what
      // happened — same move the subscribers panel makes with its heading.
      if (removed) {
        group.current?.focus();
        toast.success(`${removed} is no longer helping`);
      }
    });
  }

  const alreadyHelping = new Set(helpers.map((h) => h.user.id));
  const query = term.toLowerCase();
  const candidates = people.filter(
    (person) =>
      // You are not someone you ask for help. Picking yourself here is never
      // the intent, and it costs a row to undo.
      person.id !== currentUserId &&
      !alreadyHelping.has(person.id) &&
      (person.name.toLowerCase().includes(query) ||
        person.handle.toLowerCase().includes(query)),
  );

  return (
    <div
      ref={group}
      role="group"
      aria-label="Helpers"
      tabIndex={-1}
      className="flex flex-col gap-1 outline-none"
    >
      {helpers.map((helper) => (
        <div key={helper.id} className="group flex items-center gap-1">
          <UserChip person={helper.user} className="min-w-0 flex-1" />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${helper.user.name} as a helper`}
            disabled={pending}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            onClick={() =>
              run(
                () =>
                  removeSubscriberAction({
                    subscriberId: helper.id,
                    radarId: radar.id,
                    number: radar.number,
                  }),
                helper.user.name,
              )
            }
          >
            <X />
          </Button>
        </div>
      ))}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A stale search term would silently hide most of the list the next
          // time this opens.
          if (!next) setTerm("");
        }}
      >
        <PopoverTrigger
          disabled={pending}
          render={
            <button
              type="button"
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm"
            >
              <Plus className="size-3" />
              {helpers.length === 0 ? "Add helpers" : "Add another"}
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 p-0">
          <input
            autoFocus
            aria-label="Search people"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search people…"
            className="focus-visible:ring-ring h-8 w-full border-b bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset"
          />
          <div className="max-h-64 overflow-y-auto p-1">
            {candidates.map((person) => (
              <button
                key={person.id}
                onClick={() => {
                  setOpen(false);
                  run(() =>
                    addSubscriberAction({
                      radarId: radar.id,
                      number: radar.number,
                      userId: person.id,
                      role: "HELPER",
                    }),
                  );
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm"
              >
                <span className="min-w-0 truncate">{person.name}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  @{person.handle}
                </span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="text-muted-foreground p-2 text-xs">
                {term ? "Nobody by that name." : "Everyone is already helping."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
