// useAccountedForGate — mark-aware composition of useInventoryCoverageGate()
// + surveySessionStore's per-surface marks (mechanism-gallery-progression).
//
// This is the hook the NavBar "still to account for" indicator
// (components/UnfinishedGalleryIndicator.tsx, via StudioShell) reads — see
// lib/accountedForGate.test.ts for the pure-function-level coverage this
// hook composes on top of, and hooks/usePreviewArtifact.coverageGate.test.ts
// / editors/adapters/PhaseFGate.test.tsx for proof that the export/Phase-F
// gates (a DIFFERENT hook, useInventoryCoverageGate(), read directly) are
// unaffected by anything this hook computes.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

function resetStores() {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
}

function swapAssignment(target: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: `+ [K_X] > U+0000` } }],
    source: "user",
  };
}

function seedInstantiatedWorkingCopy(inventory: string[]) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: inventory,
  });
}

beforeEach(resetStores);
afterEach(resetStores);

describe("useAccountedForGate", () => {
  it("counts every unimplemented character as unaccounted before any marks are recorded", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);

    const { useAccountedForGate } = await import("./useAccountedForGate.ts");
    const { result } = renderHook(() => useAccountedForGate());

    expect(result.current.unaccountedDesktop).toEqual(["á", "é"]);
    expect(result.current.blockedOnDesktop).toBe(true);
  });

  it("excludes a marked character from the count — the NavBar indicator's 'still to account for' number drops", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);

    const { useAccountedForGate } = await import("./useAccountedForGate.ts");
    const { result, rerender } = renderHook(() => useAccountedForGate());
    expect(result.current.unaccountedDesktop).toEqual(["á", "é"]);

    useSurveySessionStore.getState().toggleMarkedForLaterDesktop("á");
    rerender();

    expect(result.current.unaccountedDesktop).toEqual(["é"]);
    expect(result.current.blockedOnDesktop).toBe(true);
  });

  it("reports fully accounted for (blocked: false) once every remaining gap is either implemented or marked", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);
    useWorkingCopyStore.getState().recordAssignments([swapAssignment("á")]);

    const { useAccountedForGate } = await import("./useAccountedForGate.ts");
    const { result, rerender } = renderHook(() => useAccountedForGate());
    // "á" implemented, "é" still unaccounted.
    expect(result.current.blocked).toBe(true);

    useSurveySessionStore.getState().toggleMarkedForLaterDesktop("é");
    rerender();

    expect(result.current.unaccountedDesktop).toEqual([]);
    expect(result.current.blockedOnDesktop).toBe(false);
    expect(result.current.blocked).toBe(false);
  });
});
