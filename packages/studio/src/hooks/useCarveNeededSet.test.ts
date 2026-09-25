// useCarveNeededSet — FR-066 regression (spec 079 R-09, T051): the defaults
// path (accepting a sourced exemplar/proposal, which resolves to the
// `build-list` DiscoveryMethod and never walks the marks series stations) and
// the ask-me path (`manual`, walking the marks series station-by-station)
// MUST feed this hook the same evidence for the same final orthography — a
// step's applicability must not depend on which path the author took.
//
// Both paths ultimately write through the SAME session fields
// (`session.alphabet`, `session.marksWorklist`) via `recordPhase` — this hook
// reads only those fields, never `discoveryMethod` — so the two paths differ
// only in what they hand `recordPhase`: the ask-me path always records a
// worklist (built from the marks stations the author actually walked), while
// the defaults path may complete with the marks series S0-skipped (no
// worklist recorded at all, spec 071). `deriveCarveNeededSet`'s own
// empty/absent-worklist fallback (packages/engine/src/marks/carve-needed-set.ts)
// is what keeps these two consistent: same alphabet, same needed characters,
// same `hasSignal`.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

// No language to look up in these fixtures ("no CLDR locale" is a SETTLED
// state) — this stub only guarantees that stays true.
vi.mock("../lib/services.ts", () => ({
  neededCharsForLanguage: async () => null,
}));

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
}

beforeEach(resetStores);
afterEach(resetStores);

const ALPHABET = { bases: ["a", "b"], marks: ["́"], attestedStacks: [], declaredRoles: {} };

describe("useCarveNeededSet — defaults path vs. ask-me path (FR-066)", () => {
  it("produces the same hasSignal whether the marks series was walked (ask-me) or S0-skipped (defaults)", async () => {
    const { useCarveNeededSet } = await import("./useCarveNeededSet.ts");

    // Ask-me path: the marks series was walked, recording a real worklist.
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: ALPHABET,
      marksWorklist: {
        ownLetterUnits: ["a", "b"],
        markUnits: [{ mark: "́", inputOrder: "postfix" }],
        blockedCombinations: [],
      },
    });
    const askMe = renderHook(() => useCarveNeededSet());
    await new Promise((resolve) => setTimeout(resolve, 0));

    resetStores();

    // Defaults path: the same confirmed alphabet, but the marks series never
    // recorded a worklist at all (S0-skip / accepted defaults straight
    // through).
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: ALPHABET,
    });
    const defaults = renderHook(() => useCarveNeededSet());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(askMe.result.current.hasSignal).toBe(true);
    expect(defaults.result.current.hasSignal).toBe(true);
    expect(defaults.result.current.hasSignal).toBe(askMe.result.current.hasSignal);
  });

  it("also agrees when there is no signal at all on either path (no alphabet confirmed yet)", async () => {
    const { useCarveNeededSet } = await import("./useCarveNeededSet.ts");

    const askMe = renderHook(() => useCarveNeededSet());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(askMe.result.current.hasSignal).toBe(false);
  });
});
