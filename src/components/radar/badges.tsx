import Link from "next/link";
import { cn } from "cn";
import type { Classification, RadarState, RadarSubstate } from "@/generated/prisma/enums";
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  PRIORITY_LABEL,
  PRIORITY_SHORT,
  PRIORITY_TONE,
  STATE_LABEL,
  STATE_TONE,
  SUBSTATE_LABEL,
  type Tone,
} from "@/lib/radar/taxonomy";
import { initials } from "@/lib/radar/format";

/**
 * Tone -> classes as an explicit record. Tailwind's JIT only sees complete
 * class strings, so these cannot be built by interpolation.
 */
const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-neutral-500/10 text-neutral-600 ring-neutral-500/20 dark:text-neutral-300",
  slate: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  blue: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  amber: "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300",
  red: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
  green: "bg-green-500/10 text-green-800 ring-green-500/20 dark:text-green-300",
};

/**
 * A -400/-500 dot on a 10%-tinted white sits around 2:1 — under the 3:1 that
 * non-text graphics need. On the near-black dark tint the same values have
 * plenty of headroom, so only the light shade moves.
 */
const DOT_CLASS: Record<Tone, string> = {
  gray: "bg-neutral-500 dark:bg-neutral-400",
  slate: "bg-slate-500 dark:bg-slate-400",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-700 dark:bg-amber-500",
  red: "bg-red-500",
  green: "bg-green-700 dark:bg-green-500",
};

export function ToneBadge({
  tone = "gray",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} />}
      {children}
    </span>
  );
}

export function StateBadge({
  state,
  substate,
  className,
}: {
  state: RadarState;
  substate?: RadarSubstate;
  className?: string;
}) {
  return (
    <ToneBadge tone={STATE_TONE[state]} dot className={className}>
      {STATE_LABEL[state]}
      {substate && (
        <span className="opacity-60">/ {SUBSTATE_LABEL[substate]}</span>
      )}
    </ToneBadge>
  );
}

export function PriorityBadge({
  priority,
  long = false,
}: {
  priority: number;
  long?: boolean;
}) {
  return (
    <ToneBadge tone={PRIORITY_TONE[priority] ?? "gray"}>
      {long ? PRIORITY_LABEL[priority] : PRIORITY_SHORT[priority]}
    </ToneBadge>
  );
}

export function ClassificationBadge({ value }: { value: Classification }) {
  return (
    <ToneBadge tone={CLASSIFICATION_TONE[value]}>
      {CLASSIFICATION_LABEL[value]}
    </ToneBadge>
  );
}

export type PersonLike = {
  id: string;
  name: string;
  handle?: string | null;
  image?: string | null;
};

export function Avatar({
  person,
  size = 20,
}: {
  person: PersonLike;
  size?: number;
}) {
  return person.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.image}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="bg-muted text-foreground/70 inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials(person.name)}
    </span>
  );
}

export function UserChip({
  person,
  className,
  muted = false,
}: {
  person?: PersonLike | null;
  className?: string;
  muted?: boolean;
}) {
  if (!person) {
    return (
      <span className={cn("text-muted-foreground text-sm", className)}>
        Unassigned
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Avatar person={person} />
      <span className={cn("truncate", muted && "text-muted-foreground")}>
        {person.name}
      </span>
    </span>
  );
}

export function RadarLink({
  number,
  title,
  className,
}: {
  number: number;
  title?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/radars/${number}`}
      className={cn("hover:text-foreground hover:underline", className)}
    >
      <span className="font-mono text-xs tabular-nums">{number}</span>
      {title && <span className="ml-2">{title}</span>}
    </Link>
  );
}
