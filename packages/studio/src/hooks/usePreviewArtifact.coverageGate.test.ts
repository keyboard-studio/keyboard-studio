// usePreviewArtifact — canDownload inventory-coverage regression (P0 closure).
//
// QC P0 finding: OutputScreen is directly reachable via #output (nav-bar
// click, a typed hash, or a bookmark) without ever passing through
// advance.ts's "help" case or PhaseFGate — so canDownload previously gated
// ONLY on compile-readiness + working-copy instantiation, letting an author
// download (or submit via the Option B PR path, which shares canDownload as
// canSubmit) a .zip with unimplemented inventory characters.
//
// Fix under test: canDownload additionally folds in
// `!inventoryCoverageGate(...).blocked` — the SAME shared selector
// (lib/unimplementedInventory.ts) StepHost's Phase F hard-gate context build
// and PhaseFGate use, so the three call sites can never drift from each
// other. This test proves the fold: canDownload stays false while the
// compile is ready and the working copy is instantiated but an inventory
// character has no physical mechanism, and flips true once every character
// is covered.
//
// Approach: mock useKeyboardArtifact directly (precedent:
// StudioShell.previewCommitGating.test.tsx) to force stage:"ready"
// unconditionally, so the test isolates the coverage-gate fold rather than
// driving the real async compile pipeline.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { Stage } from "./useKeyboardArtifact.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("./useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({
    stage: READY_STAGE,
    retry: vi.fn(),
    recompile: vi.fn(),
  }),
}));

function resetStore() {
  useWorkingCopyStore.getState().reset();
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
  // spec 059: canDownload folds in the attribution gates alongside coverage, so a
  // fixture meant to isolate COVERAGE has to satisfy attribution — otherwise the
  // "becomes emittable" assertion would fail on an unrelated gate.
  useWorkingCopyStore.getState().setAttribution({
    authorName: "Alice Example",
    copyrightHolder: "Alice Example",
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: inventory,
  });
}

beforeEach(resetStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("usePreviewArtifact — canDownload folds in inventory coverage (P0)", () => {
  it("is NOT emittable (canDownload === false) while an inventory character has no desktop mechanism, even though compile is ready and the working copy is instantiated", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);
    // Only "á" gets a physical mechanism — "é" is left unimplemented.
    useWorkingCopyStore.getState().recordAssignments([swapAssignment("á")]);

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    const { result } = renderHook(() => usePreviewArtifact());

    expect(result.current.stage.kind).toBe("ready");
    expect(result.current.coverageGate.blocked).toBe(true);
    expect(result.current.coverageGate.unimplementedDesktop).toEqual(["é"]);
    expect(result.current.canDownload).toBe(false);
  });

  it("becomes emittable (canDownload === true) once every inventory character has a physical mechanism", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);
    useWorkingCopyStore.getState().recordAssignments([swapAssignment("á"), swapAssignment("é")]);

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    const { result } = renderHook(() => usePreviewArtifact());

    expect(result.current.stage.kind).toBe("ready");
    expect(result.current.coverageGate.blocked).toBe(false);
    expect(result.current.canDownload).toBe(true);
  });

  it("handleDownload refuses to serialize (sets downloadError, never proceeds) even if invoked while coverage is blocked", async () => {
    seedInstantiatedWorkingCopy(["á", "é"]);
    useWorkingCopyStore.getState().recordAssignments([swapAssignment("á")]);

    const { usePreviewArtifact } = await import("./usePreviewArtifact.ts");
    const { result, rerender } = renderHook(() => usePreviewArtifact());

    expect(result.current.canDownload).toBe(false);
    await result.current.handleDownload();
    rerender();

    expect(result.current.downloadError).not.toBeNull();
  });
});
