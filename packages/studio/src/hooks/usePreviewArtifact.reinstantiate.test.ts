// usePreviewArtifact — re-instantiation guard regression test.
//
// Bug: at the end of the survey, the Output/Preview screen mounts its OWN
// decoupled artifact pipeline (see usePreviewArtifact's module comment). That
// pipeline's full run() fires onInstantiate on mount for the base the survey
// already instantiated. onInstantiate used to unconditionally call
// instantiateFromBaseIfConfirmed, which:
//   - popped window.confirm("Switching base keyboards will discard your current
//     edits (carve deletions and survey answers). Continue?") over work already
//     in the store, and
//   - on confirm, re-ran Track 1 instantiateFromBase against a store that (for a
//     Track 2 / adapt-existing survey) was in a different mode — a same-id
//     "genuine switch" that reset phaseResults + irAxes, discarding the survey
//     answers and leaving nothing valid to submit.
// So a user who did NOT click Cancel wiped their own submission.
//
// Fix under test: usePreviewArtifact.onInstantiate skips instantiation entirely
// when the store already holds a working copy for the SAME base id, and only
// falls through to instantiateFromBaseIfConfirmed for a genuinely NEW base
// picked via this screen's own picker.
//
// Approach: mock useKeyboardArtifact to CAPTURE the onInstantiate callback the
// hook passes it (rather than driving the real WASM compile pipeline, which the
// sibling test file avoids for good reason), and mock instantiateFromBaseIfConfirmed
// as a spy. Then invoke the captured callback directly for both the same-base and
// different-base cases and assert on whether the spy fired.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus, silEuroLatin } from "@keyboard-studio/contracts/fixtures";
import type { OnInstantiateCallback } from "./useKeyboardArtifact.ts";

const hoisted = vi.hoisted(() => ({
  capturedOnInstantiate: { current: null as OnInstantiateCallback | null },
  instantiateSpy: vi.fn(),
}));

// Capture the onInstantiate callback usePreviewArtifact wires into the artifact
// pipeline, and return a stable idle stage so the hook renders without touching
// the real engine.
vi.mock("./useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _base: unknown,
    _spec: unknown,
    _transform: unknown,
    onInstantiate: OnInstantiateCallback | null | undefined,
  ) => {
    hoisted.capturedOnInstantiate.current = onInstantiate ?? null;
    return { stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() };
  },
}));

// The working-copy transform pulls engine imports at module load; stub it so the
// hook render does not require the real engine.
vi.mock("./useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

// Spy on the shared re-base helper. The guard's whole job is to decide whether
// this is called.
vi.mock("../lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: (...args: unknown[]) => hoisted.instantiateSpy(...args),
}));

// Import AFTER the mocks so the store is the real singleton (not mocked).
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

function seedTrack2Survey() {
  // End-of-survey state: instantiated via Track 2 (adapt-existing) with a
  // recorded survey answer, exactly the state that made confirm() destructive.
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, {
    vfs,
    ir: makeTestIR([]),
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "A",
    answers: [],
    computedAxes: { scale: "medium" },
  });
}

const instantiatePayload = {
  vfs: createVirtualFS([]),
  ir: makeTestIR([]),
  removalCapabilities: new Map(),
};

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  hoisted.capturedOnInstantiate.current = null;
});
afterEach(() => {
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

describe("usePreviewArtifact — re-instantiation guard", () => {
  it("does NOT re-instantiate (no confirm dialog) when onInstantiate fires for the base already in the store", async () => {
    seedTrack2Survey();
    const phaseResultsBefore = useWorkingCopyStore.getState().phaseResults.length;
    expect(phaseResultsBefore).toBeGreaterThan(0);

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    renderHook(() => usePreviewArtifact());

    const onInstantiate = hoisted.capturedOnInstantiate.current;
    expect(onInstantiate).not.toBeNull();

    // Simulate the mount-time compile firing onInstantiate for the SAME base.
    onInstantiate!(basicKbdus, instantiatePayload);

    // Guard short-circuits: the re-base helper is never called, so no confirm
    // dialog and the survey working copy is preserved intact.
    expect(hoisted.instantiateSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("adapt-existing");
    expect(useWorkingCopyStore.getState().phaseResults.length).toBe(phaseResultsBefore);
  });

  it("DOES delegate to instantiateFromBaseIfConfirmed for a genuinely different base picked on this screen", async () => {
    seedTrack2Survey();

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    renderHook(() => usePreviewArtifact());

    const onInstantiate = hoisted.capturedOnInstantiate.current;
    expect(onInstantiate).not.toBeNull();

    // A genuine base switch (different id) must still go through the confirm path.
    onInstantiate!(silEuroLatin, instantiatePayload);

    expect(hoisted.instantiateSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.instantiateSpy).toHaveBeenCalledWith(silEuroLatin, expect.anything());
  });
});
