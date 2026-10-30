// carveNeededSet — the lifted composition equals the hook the UI calls.
// `resolveCarveNeededSet` must return what `useCarveNeededSet` settles to for
// the same working copy (spec 107 FR-040: one composition, two callers).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { resolveCarveNeededSet } from "./carveNeededSet.ts";
import { useCarveNeededSet } from "../hooks/useCarveNeededSet.ts";

// A language with an exemplar set, so the settled value includes the async slice.
vi.mock("./services.ts", () => ({
  neededCharsForLanguage: async (bcp47: string) => (bcp47 === "fr" ? new Set(["é", "ç"]) : null),
}));

const ALPHABET = { bases: ["a", "b"], marks: ["́"], attestedStacks: [], declaredRoles: {} };

function reset(): void {
  useWorkingCopyStore.getState().reset();
}
beforeEach(reset);
afterEach(reset);

function seed(bcp47: string | undefined): void {
  const wc = useWorkingCopyStore.getState();
  wc.recordPhase({
    phase: "B",
    answers: [],
    alphabet: ALPHABET,
    marksWorklist: {
      ownLetterUnits: ["a", "b"],
      markUnits: [{ mark: "́", inputOrder: "postfix" }],
      blockedCombinations: [],
    },
  });
  if (bcp47 !== undefined) wc.setIdentity({ bcp47 });
}

describe("resolveCarveNeededSet", () => {
  for (const bcp47 of [undefined, "fr", "zz"]) {
    it(`equals the settled useCarveNeededSet for ${bcp47 ?? "no language"}`, async () => {
      seed(bcp47);
      const settled = await resolveCarveNeededSet(useWorkingCopyStore.getState());
      const hook = renderHook(() => useCarveNeededSet());
      await waitFor(() => expect(hook.result.current.neededCharsResolved).toBe(true));
      const { neededCharsResolved: _resolved, ...fromHook } = hook.result.current;
      expect(settled).toEqual(fromHook);
    });
  }
});
