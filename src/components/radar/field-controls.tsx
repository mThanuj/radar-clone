"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import type { RadarState, RadarSubstate } from "@/generated/prisma/enums";
import {
  SUBSTATES_BY_STATE,
  ALL_STATES,
  TRANSITIONS,
} from "@/lib/radar/state-machine";
import { STATE_LABEL, SUBSTATE_LABEL } from "@/lib/radar/taxonomy";
import { updateRadarAction } from "@/server/radars/actions";
import type { RadarPatch } from "@/server/radars/mutations";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StateBadge } from "@/components/radar/badges";

export type RadarRef = { id: string; number: number; version: number };

/**
 * One place where every inline edit on the detail page goes. Carries
 * `expectedVersion` so a stale tab gets told rather than silently clobbering
 * someone else's change.
 */
export function useRadarPatch(radar: RadarRef) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const patch = (data: RadarPatch, successMessage?: string) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await updateRadarAction({
          radarId: radar.id,
          number: radar.number,
          expectedVersion: radar.version,
          patch: data,
        });
        if (result.ok) {
          if (successMessage) toast.success(successMessage);
          router.refresh();
          resolve(true);
        } else {
          toast.error(result.error);
          resolve(false);
        }
      });
    });

  return { patch, pending };
}

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1">
      <span className="text-muted-foreground pt-1 text-xs">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Trigger for every picker in the sidebar.
 *
 * Base UI's `render` prop clones this element and hands it the open handler,
 * the ref and the aria wiring — so it has to spread everything it receives
 * onto the real <button>. Swallowing the props leaves a button that looks
 * right and does nothing.
 */
export function PickerButton({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "hover:bg-muted flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left text-sm",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown className="text-muted-foreground size-3 shrink-0" />
    </button>
  );
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  radar,
  field,
  value,
  options,
  display,
  allowEmpty = false,
  emptyLabel = "None",
  searchable = false,
}: {
  radar: RadarRef;
  field: keyof RadarPatch;
  value: string | null;
  options: SelectOption[];
  display?: React.ReactNode;
  allowEmpty?: boolean;
  emptyLabel?: string;
  searchable?: boolean;
}) {
  const { patch, pending } = useRadarPatch(radar);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const current = options.find((o) => o.value === value);
  const filtered = term
    ? options.filter((o) => o.label.toLowerCase().includes(term.toLowerCase()))
    : options;

  async function choose(next: string | null) {
    setOpen(false);
    if (next === value) return;
    await patch({ [field]: next } as RadarPatch);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={pending}
        render={
          <PickerButton>
            {display ?? current?.label ?? (
              <span className="text-muted-foreground">{emptyLabel}</span>
            )}
          </PickerButton>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        {searchable && (
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search…"
            className="h-8 w-full border-b bg-transparent px-2 text-xs outline-none"
          />
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {allowEmpty && (
            <button
              onClick={() => choose(null)}
              className="hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm"
            >
              <span className="text-muted-foreground">{emptyLabel}</span>
              {value === null && <Check className="size-3" />}
            </button>
          )}
          {filtered.map((option) => (
            <button
              key={option.value}
              onClick={() => choose(option.value)}
              className="hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm"
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check className="size-3 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * State and substate move together — the picker only ever offers pairs the
 * transition table allows, so an illegal combination is unreachable from the
 * UI as well as rejected by the server.
 */
export function StateField({
  radar,
  state,
  substate,
}: {
  radar: RadarRef;
  state: RadarState;
  substate: RadarSubstate;
}) {
  const { patch, pending } = useRadarPatch(radar);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<RadarState>(state);

  const reachable = ALL_STATES.filter((s) => TRANSITIONS[state].includes(s));

  async function choose(nextState: RadarState, nextSubstate: RadarSubstate) {
    setOpen(false);
    if (nextState === state && nextSubstate === substate) return;
    await patch(
      { state: nextState, substate: nextSubstate },
      `Moved to ${STATE_LABEL[nextState]} / ${SUBSTATE_LABEL[nextSubstate]}`,
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTarget(state);
      }}
    >
      <PopoverTrigger
        disabled={pending}
        render={
          <button className="hover:bg-muted w-full rounded-md px-1.5 py-1 text-left">
            <StateBadge state={state} substate={substate} />
          </button>
        }
      />
      <PopoverContent align="start" className="flex w-[22rem] gap-0 p-0">
        <div className="w-1/2 border-r p-1">
          {reachable.map((s) => (
            <button
              key={s}
              onMouseEnter={() => setTarget(s)}
              onFocus={() => setTarget(s)}
              className={cn(
                "hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm",
                s === target && "bg-muted",
              )}
            >
              {STATE_LABEL[s]}
              {s === state && <Check className="size-3" />}
            </button>
          ))}
        </div>
        <div className="max-h-64 w-1/2 overflow-y-auto p-1">
          <p className="text-muted-foreground px-2 py-1 text-xs">
            {target === "CLOSED" ? "Resolution" : "Substate"}
          </p>
          {SUBSTATES_BY_STATE[target].map((sub) => (
            <button
              key={sub}
              onClick={() => choose(target, sub)}
              className="hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm"
            >
              <span className="truncate">{SUBSTATE_LABEL[sub]}</span>
              {target === state && sub === substate && (
                <Check className="size-3 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DueDateField({
  radar,
  value,
}: {
  radar: RadarRef;
  value: Date | null;
}) {
  const { patch, pending } = useRadarPatch(radar);
  const iso = value ? new Date(value).toISOString().slice(0, 10) : "";

  // Controlled, because this input stays mounted across the router.refresh()
  // that follows a save — an uncontrolled defaultValue would be changing under
  // React after initialization. Synced during render rather than in an effect,
  // which is React's documented way to adjust state when a prop changes.
  const [draft, setDraft] = useState(iso);
  const [syncedFrom, setSyncedFrom] = useState(iso);
  if (iso !== syncedFrom) {
    setSyncedFrom(iso);
    setDraft(iso);
  }

  function commit(next: string) {
    setDraft(next);
    patch({ dueDate: next ? new Date(next) : null });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={draft}
        disabled={pending}
        onChange={(event) => commit(event.target.value)}
        className="hover:bg-muted rounded-md px-1.5 py-1 text-sm outline-none"
      />
      {draft && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => commit("")}
          aria-label="Clear due date"
        >
          ×
        </Button>
      )}
    </div>
  );
}
