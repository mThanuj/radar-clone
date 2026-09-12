import { describe, expect, it } from "vitest";
import {
  ALL_STATES,
  DEFAULT_SUBSTATE,
  RESOLUTIONS,
  SUBSTATES_BY_STATE,
  TRANSITIONS,
  TransitionError,
  assertTransition,
  isLegalPair,
  resolutionOf,
  resolveSubstate,
} from "@/lib/radar/state-machine";
import type { RadarState, RadarSubstate } from "@/generated/prisma/enums";

const ALL_SUBSTATES = [
  ...new Set(Object.values(SUBSTATES_BY_STATE).flat()),
] as RadarSubstate[];

describe("state / substate matrix", () => {
  // The crux of the whole app: every cell of (state x substate) is either
  // explicitly legal or explicitly rejected. No third answer.
  it("accepts exactly the declared pairs and rejects every other cell", () => {
    for (const state of ALL_STATES) {
      for (const substate of ALL_SUBSTATES) {
        const declared = SUBSTATES_BY_STATE[state].includes(substate);
        expect(isLegalPair(state, substate)).toBe(declared);

        const attempt = () =>
          assertTransition({ state, substate: SUBSTATES_BY_STATE[state][0] }, { state, substate });

        if (declared) expect(attempt).not.toThrow();
        else expect(attempt).toThrow(TransitionError);
      }
    }
  });

  it("gives every state a default substate that is legal for it", () => {
    for (const state of ALL_STATES) {
      expect(SUBSTATES_BY_STATE[state]).toContain(DEFAULT_SUBSTATE[state]);
    }
  });

  it("treats the CLOSED substates as the resolution vocabulary", () => {
    expect(RESOLUTIONS).toBe(SUBSTATES_BY_STATE.CLOSED);
    expect(resolutionOf({ state: "CLOSED", substate: "DUPLICATE" })).toBe("DUPLICATE");
    expect(resolutionOf({ state: "ANALYZE", substate: "OPEN" })).toBeNull();
  });
});

describe("state moves", () => {
  it("rejects moves that are not in the transition table", () => {
    // A closed radar reopens into ANALYZE, never straight back to VERIFY.
    expect(() =>
      assertTransition(
        { state: "CLOSED", substate: "SOFTWARE_CHANGED" },
        { state: "VERIFY", substate: "VERIFY" },
      ),
    ).toThrow(TransitionError);

    expect(() =>
      assertTransition(
        { state: "CLOSED", substate: "SOFTWARE_CHANGED" },
        { state: "ANALYZE", substate: "OPEN" },
      ),
    ).not.toThrow();
  });

  it("allows every declared transition with the target's default substate", () => {
    for (const from of ALL_STATES) {
      for (const to of TRANSITIONS[from]) {
        expect(() =>
          assertTransition(
            { state: from, substate: SUBSTATES_BY_STATE[from][0] },
            { state: to, substate: DEFAULT_SUBSTATE[to] },
          ),
        ).not.toThrow();
      }
    }
  });
});

describe("resolveSubstate", () => {
  it("keeps the current substate when it stays legal", () => {
    // FIX is legal in both ANALYZE and INTEGRATE, so a board drag keeps it.
    expect(resolveSubstate("INTEGRATE", undefined, "FIX")).toBe("FIX");
  });

  it("falls back to the target default when the current one does not apply", () => {
    expect(resolveSubstate("CLOSED", undefined, "OPEN")).toBe(
      DEFAULT_SUBSTATE.CLOSED,
    );
  });

  it("always honours an explicit request", () => {
    expect(resolveSubstate("CLOSED", "WITHDRAWN", "OPEN")).toBe("WITHDRAWN");
  });

  it("never produces an illegal pair for any state", () => {
    for (const state of ALL_STATES as RadarState[]) {
      for (const current of ALL_SUBSTATES) {
        expect(isLegalPair(state, resolveSubstate(state, undefined, current))).toBe(
          true,
        );
      }
    }
  });
});
