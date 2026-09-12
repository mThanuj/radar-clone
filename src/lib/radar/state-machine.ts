import { RadarState, RadarSubstate } from "@/generated/prisma/enums";

/**
 * Radar has no `resolution` field. What other trackers call a resolution is
 * the substate of the CLOSED state — `Closed / Duplicate` is one cell in a
 * (state x substate) matrix. Keeping it as one pair means the two can never
 * disagree, which is the failure mode of every tracker that denormalizes it.
 *
 * This table is the single source of truth for: the state picker, the close
 * dialog's resolution list, the board's legal drop targets, and server-side
 * validation in updateRadar(). Encoding it twice would guarantee drift.
 */
export const SUBSTATES_BY_STATE: Record<RadarState, readonly RadarSubstate[]> =
  {
    ANALYZE: ["OPEN", "ANALYZE", "INVESTIGATE", "FIX"],
    INTEGRATE: ["INTEGRATE", "FIX"],
    VERIFY: ["VERIFY", "FIX"],
    CLOSED: [
      "SOFTWARE_CHANGED",
      "DUPLICATE",
      "BEHAVES_CORRECTLY",
      "UNABLE_TO_REPRODUCE",
      "INSUFFICIENT_INFORMATION",
      "NOT_TO_BE_FIXED",
      "WONT_FIX",
      "NO_ACTION",
      "THIRD_PARTY_TO_RESOLVE",
      "WITHDRAWN",
    ],
  };

/** Applied when a caller moves state without naming a substate. */
export const DEFAULT_SUBSTATE: Record<RadarState, RadarSubstate> = {
  ANALYZE: "OPEN",
  INTEGRATE: "INTEGRATE",
  VERIFY: "VERIFY",
  CLOSED: "SOFTWARE_CHANGED",
};

/** The CLOSED substates, i.e. the resolution vocabulary. */
export const RESOLUTIONS = SUBSTATES_BY_STATE.CLOSED;

/**
 * Legal state moves. Deliberately permissive — Radar lets you route work
 * backwards — but reopening always lands in ANALYZE rather than jumping
 * straight back to VERIFY.
 */
export const TRANSITIONS: Record<RadarState, readonly RadarState[]> = {
  ANALYZE: ["ANALYZE", "INTEGRATE", "VERIFY", "CLOSED"],
  INTEGRATE: ["INTEGRATE", "ANALYZE", "VERIFY", "CLOSED"],
  VERIFY: ["VERIFY", "ANALYZE", "INTEGRATE", "CLOSED"],
  CLOSED: ["CLOSED", "ANALYZE"],
};

export const ALL_STATES = Object.keys(SUBSTATES_BY_STATE) as RadarState[];

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export function isLegalPair(
  state: RadarState,
  substate: RadarSubstate,
): boolean {
  return SUBSTATES_BY_STATE[state].includes(substate);
}

export function isLegalStateMove(from: RadarState, to: RadarState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A resolution is a projection, never a stored column. */
export function resolutionOf(radar: {
  state: RadarState;
  substate: RadarSubstate;
}): RadarSubstate | null {
  return radar.state === "CLOSED" ? radar.substate : null;
}

export function isClosed(radar: { state: RadarState }): boolean {
  return radar.state === "CLOSED";
}

/**
 * Resolve the substate for a move. Callers often change only the state (a
 * board drag, say); carry the substate over when it stays legal, otherwise
 * fall back to the target state's default.
 */
export function resolveSubstate(
  target: RadarState,
  requested: RadarSubstate | undefined,
  current: RadarSubstate,
): RadarSubstate {
  if (requested) return requested;
  if (isLegalPair(target, current)) return current;
  return DEFAULT_SUBSTATE[target];
}

/**
 * Throws unless the move is legal. Called inside the updateRadar transaction,
 * before anything is written.
 */
export function assertTransition(
  before: { state: RadarState; substate: RadarSubstate },
  next: { state: RadarState; substate: RadarSubstate },
): void {
  if (!isLegalStateMove(before.state, next.state)) {
    throw new TransitionError(
      `Cannot move from ${before.state} to ${next.state}. Allowed: ${TRANSITIONS[before.state].join(", ")}.`,
    );
  }
  if (!isLegalPair(next.state, next.substate)) {
    throw new TransitionError(
      `${next.substate} is not a substate of ${next.state}. Allowed: ${SUBSTATES_BY_STATE[next.state].join(", ")}.`,
    );
  }
}
