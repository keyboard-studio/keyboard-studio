// usePreviewArtifact — mount-seeding regression test.
//
// Coverage goal: the default flow can navigate straight to #output (e.g.
// handlePhaseFComplete -> navigateTo("output")) without ever visiting
// #preview. OutputScreen mounts its own independent usePreviewArtifact()
// instance (see the hook's module comment) and its local `baseKeyboard` state
// used to always start at null, gating the download affordance
// (data-testid="emit-download" in OutputScreen.tsx) closed even when the
// working-copy store already has an instantiated base from an earlier step.
//
// Fix under test: usePreviewArtifact's local baseKeyboard is lazy-initialized
// from useWorkingCopyStore.getState().baseKeyboard, so a freshly-mounted
// screen picks up the already-instantiated base immediately.
//
// Approach: mock @keyboard-studio/engine minimally (loadEngine() just needs
// the three required exports to resolve as a module) so useKeyboardArtifact's
// effect does not throw; assert on the hook's returned baseKeyboard value
// synchronously at mount, before any async compile settles.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";

vi.mock("@keyboard-studio/engine", () => ({
  init: vi.fn(() => Promise.resolve()),
  isReady: vi.fn(() => true),
  compile: vi.fn(() => new Promise(() => { /* never settles in this test */ })),
  fetchKeyboardSourceToVfs: vi.fn(() => new Promise(() => { /* never settles */ })),
}));

function resetStore() {
  useWorkingCopyStore.getState().reset();
}

beforeEach(resetStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("usePreviewArtifact — mount seeding from the working-copy store", () => {
  it("starts with baseKeyboard === null when the store has no instantiated base", async () => {
    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    const { result } = renderHook(() => usePreviewArtifact());
    expect(result.current.baseKeyboard).toBeNull();
  });

  it("seeds baseKeyboard from the store's already-instantiated base at mount (no prior #preview visit)", async () => {
    // Mirrors the default-flow ordering: choose_base -> survey -> PhaseF ->
    // navigateTo("output") directly, so the store is instantiated BEFORE
    // OutputScreen's usePreviewArtifact instance ever mounts.
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs,
      ir: makeTestIR([]),
    });

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    const { result } = renderHook(() => usePreviewArtifact());

    expect(result.current.baseKeyboard).not.toBeNull();
    expect(result.current.baseKeyboard?.id).toBe(basicKbdus.id);
  });
});
