// Unit tests for SurveyView stage-machine transitions.
//
// Coverage: the 4 new forward transitions (prefill→B, B→carve, carve→mechanisms,
// mechanisms→F) plus the back-navigation changes (B→prefill, carve→B, F→E,
// mechanisms→B). Stage order (issue #508): prefill → B → carve → mechanisms → E → F → done.
//
// Strategy: mock every child component at the shallowest level so each mock
// renders a unique data-testid and a single button that fires its callback.
// Heavy hook dependencies (useKeyboardArtifact, useWorkingCopyTransform,
// instantiateFromBaseIfConfirmed) are mocked to keep WASM and VFS out of the
// picture. Navigation to a starting stage is achieved by clicking through the
// sequence of mocked buttons that lead up to it.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";

// ---------------------------------------------------------------------------
// vi.hoisted — must precede vi.mock() calls
// ---------------------------------------------------------------------------

const {
  mockIdentityCompleteRef,
  mockBaseResolvedRef,
  mockCarveDoneRef,
  mockCarveBackRef,
  mockPhaseBDoneRef,
  mockPhaseBBackRef,
  mockMechDoneRef,
  mockMechBackRef,
  mockPhaseFDoneRef,
  mockPhaseFBackRef,
  mockTouchECompleteRef,
  mockTouchEAssignmentsRef,
  mockTouchEBackRef,
} = vi.hoisted(() => {
  // These refs are updated by mock components so the latest callback is always
  // available to the test when it fires a button click.
  const mockIdentityCompleteRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockBaseResolvedRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPrefillConfirmRef = { current: null as null | (() => void) };
  const mockCarveDoneRef = { current: null as null | (() => void) };
  const mockCarveBackRef = { current: null as null | (() => void) };
  const mockPhaseBDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseBBackRef = { current: null as null | (() => void) };
  const mockMechDoneRef = { current: null as null | (() => void) };
  const mockMechBackRef = { current: null as null | (() => void) };
  const mockPhaseFDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseFBackRef = { current: null as null | (() => void) };
  // TouchGallery mock: ref holds the onComplete callback so tests can fire it
  // with arbitrary assignments, and ref holds the assignments to emit.
  const mockTouchECompleteRef = { current: null as null | ((a: unknown[]) => void) };
  // Tests set this before clicking e-complete to control the emitted assignments.
  const mockTouchEAssignmentsRef = { current: [] as unknown[] };
  // onBack callback ref.
  const mockTouchEBackRef = { current: null as null | (() => void) };
  return {
    mockIdentityCompleteRef,
    mockBaseResolvedRef,
    mockPrefillConfirmRef,
    mockCarveDoneRef,
    mockCarveBackRef,
    mockPhaseBDoneRef,
    mockPhaseBBackRef,
    mockMechDoneRef,
    mockMechBackRef,
    mockPhaseFDoneRef,
    mockPhaseFBackRef,
    mockTouchECompleteRef,
    mockTouchEAssignmentsRef,
    mockTouchEBackRef,
  };
});

// Re-export under the names the test body uses.
// (vi.hoisted returns won't shadow module scope, so we alias here.)
const _mockIdentityCompleteRef = mockIdentityCompleteRef;
const _mockBaseResolvedRef = mockBaseResolvedRef;
const _mockCarveDoneRef = mockCarveDoneRef;
const _mockCarveBackRef = mockCarveBackRef;
const _mockPhaseBDoneRef = mockPhaseBDoneRef;
const _mockPhaseBBackRef = mockPhaseBBackRef;
const _mockMechDoneRef = mockMechDoneRef;
const _mockMechBackRef = mockMechBackRef;
const _mockPhaseFDoneRef = mockPhaseFDoneRef;
const _mockPhaseFBackRef = mockPhaseFBackRef;
const _mockTouchECompleteRef = mockTouchECompleteRef;
const _mockTouchEAssignmentsRef = mockTouchEAssignmentsRef;
const _mockTouchEBackRef = mockTouchEBackRef;

// ---------------------------------------------------------------------------
// Mock child survey components — shallow stubs that record callbacks.
// ---------------------------------------------------------------------------

vi.mock("./survey/index.ts", () => {
  // Minimal fake IdentityLiteResult for the mock to emit.
  const fakeIdentity = {
    autonym: "English",
    english: "English",
    languageSubtag: "en",
    targetScriptRaw: "Latn",
    bcp47: "en-Latn",
    supported: true,
    prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
  };
  const fakePhaseResult = { phase: "B" as const, answers: [], confirmedInventory: [] };

  return {
    IdentityLite: ({ onComplete }: { onComplete: (result: unknown, identity: unknown) => void }) => {
      _mockIdentityCompleteRef.current = onComplete;
      return (
        <div data-testid="stage-identity">
          <button
            type="button"
            data-testid="identity-complete"
            onClick={() => onComplete(fakePhaseResult, fakeIdentity)}
          >
            identity-complete
          </button>
        </div>
      );
    },
    Prefill: ({ onConfirm, onBack }: { onConfirm: () => void; onBack?: () => void }) => {
      return (
        <div data-testid="stage-prefill">
          <button type="button" data-testid="prefill-confirm" onClick={onConfirm}>
            prefill-confirm
          </button>
          {onBack !== undefined && (
            <button type="button" data-testid="prefill-back" onClick={onBack}>
              prefill-back
            </button>
          )}
        </div>
      );
    },
    PhaseB: ({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) => {
      _mockPhaseBDoneRef.current = onComplete;
      _mockPhaseBBackRef.current = onBack ?? null;
      return (
        <div data-testid="stage-B">
          <button type="button" data-testid="phaseB-complete" onClick={() => onComplete(fakePhaseResult)}>
            phaseB-complete
          </button>
          {onBack !== undefined && (
            <button type="button" data-testid="phaseB-back" onClick={onBack}>
              phaseB-back
            </button>
          )}
        </div>
      );
    },
    PhaseF: ({ onComplete, onBack }: { onComplete: (r: unknown) => void; onBack?: () => void }) => {
      _mockPhaseFDoneRef.current = onComplete;
      _mockPhaseFBackRef.current = onBack ?? null;
      return (
        <div data-testid="stage-F">
          <button type="button" data-testid="phaseF-complete" onClick={() => onComplete(fakePhaseResult)}>
            phaseF-complete
          </button>
          {onBack !== undefined && (
            <button type="button" data-testid="phaseF-back" onClick={onBack}>
              phaseF-back
            </button>
          )}
        </div>
      );
    },
    // PhaseA re-exported as a no-op (not used in the wizard path under test)
    PhaseA: () => <div data-testid="stage-A" />,
    SurveyRunner: () => <div data-testid="survey-runner" />,
    extractIdentityLite: (r: unknown) => r,
    extractIdentity: () => ({}),
    extractProvenance: () => ({}),
    buildPrefillRows: () => [],
  };
});

vi.mock("./editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: ({ onResolved, onBack }: { onResolved: (base: unknown) => void; onBack?: () => void }) => {
    _mockBaseResolvedRef.current = onResolved;
    const fakeBase = {
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      displayName: "English (US)",
      targets: ["windows"],
      version: "1.0",
    };
    return (
      <div data-testid="stage-base">
        <button type="button" data-testid="base-resolved" onClick={() => onResolved(fakeBase)}>
          base-resolved
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="base-back" onClick={onBack}>
            base-back
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./editors/carve/CarveGallery.tsx", () => ({
  CarveGallery: ({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) => {
    _mockCarveDoneRef.current = onComplete;
    _mockCarveBackRef.current = onBack ?? null;
    return (
      <div data-testid="stage-carve">
        <button type="button" data-testid="carve-complete" onClick={onComplete}>
          carve-complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="carve-back" onClick={onBack}>
            carve-back
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: ({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) => {
    _mockMechDoneRef.current = onComplete;
    _mockMechBackRef.current = onBack ?? null;
    return (
      <div data-testid="stage-mechanisms">
        <button type="button" data-testid="mechanisms-complete" onClick={onComplete}>
          mechanisms-complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="mechanisms-back" onClick={onBack}>
            mechanisms-back
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./editors/assignLoop/TouchGallery.tsx", () => ({
  TouchGallery: ({ onComplete, onBack }: { onComplete: (a: unknown[]) => void; onBack: () => void }) => {
    _mockTouchECompleteRef.current = onComplete;
    _mockTouchEBackRef.current = onBack;
    return (
      <div data-testid="stage-E">
        <button
          type="button"
          data-testid="e-complete"
          onClick={() => onComplete(_mockTouchEAssignmentsRef.current)}
        >
          Continue
        </button>
        <button
          type="button"
          data-testid="e-back"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    );
  },
}));

vi.mock("./components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: ({ script }: { script: string }) => (
    <div data-testid="stage-unsupported">{script}</div>
  ),
}));

vi.mock("./editors/panels/TrackStep.tsx", () => ({
  TrackStep: ({ onNext, onBack }: { onNext: (t: "copy" | "adapt") => void; onBack?: () => void }) => (
    <div data-testid="stage-track">
      <button type="button" data-testid="track-copy" onClick={() => onNext("copy")}>
        track-copy
      </button>
      <button type="button" data-testid="track-adapt" onClick={() => onNext("adapt")}>
        track-adapt
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="track-back" onClick={onBack}>
          track-back
        </button>
      )}
    </div>
  ),
}));

vi.mock("./editors/panels/ProjectNameStep.tsx", () => ({
  ProjectNameStep: ({
    onNext,
    onBack,
  }: {
    onNext: (displayName: string, keyboardId: string) => void;
    onBack?: () => void;
  }) => (
    <div data-testid="stage-project-name">
      <button
        type="button"
        data-testid="project-name-next"
        onClick={() => onNext("Test Keyboard", "test_keyboard")}
      >
        project-name-next
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="project-name-back" onClick={onBack}>
          project-name-back
        </button>
      )}
    </div>
  ),
}));

vi.mock("./components/OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame" />,
}));

vi.mock("./components/OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-toggle" />,
}));

// ---------------------------------------------------------------------------
// Mock heavy hooks so WASM / VFS are never touched.
// ---------------------------------------------------------------------------

vi.mock("./hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));

vi.mock("./hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

vi.mock("./lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
}));

// Mock buildTouchLayoutJson so Defect B tests never call real engine code.
// Returns a deterministic JSON string that includes the assignment info.
vi.mock("./lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: (
    _baseIr: unknown,
    assignments: Array<{ target: string; mechanisms: Array<{ patternId: string; slotValues?: Record<string, string> }> }>,
  ) => ({
    json: JSON.stringify({ _mock: true, assignments }),
    warnings: [],
  }),
}));

// Shallow stubs for PreviewScreen and OutputScreen — routing tests assert on
// the marker divs, not the internal pipeline.
vi.mock("./components/PreviewScreen.tsx", () => ({
  PreviewScreen: () => <div data-testid="preview-screen-root">preview-screen</div>,
}));

vi.mock("./components/OutputScreen.tsx", () => ({
  OutputScreen: () => <div data-testid="output-screen-root">output-screen</div>,
}));

// Shallow stub for FlowMapView — only rendered in dev/VITE_SHOW_FLOWMAP builds.
vi.mock("./flowmap/FlowMapView.tsx", () => ({
  FlowMapView: () => <div data-testid="flow-map-view">flow-map</div>,
}));

// Spy on navigateTo so the done-stage routing test can assert it was called
// without actually mutating window.location.
vi.mock("./lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the component under test — AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { SurveyView, StudioShell } from "./StudioShell.tsx";
import { navigateTo } from "./lib/navigate.ts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drive the wizard from "identity" to "base" (click identity-complete). */
function advanceToBase() {
  fireEvent.click(screen.getByTestId("identity-complete"));
}

/** Drive from "identity" to "track" (identity → base → track). */
function advanceToTrack() {
  advanceToBase();
  fireEvent.click(screen.getByTestId("base-resolved"));
}

/**
 * Drive from "identity" to "prefill" via the default Track 1 (Copy) path:
 * identity → base → track → project-name → prefill.
 *
 * Track 2 (Adapt) skips project-name; tests that need that path should
 * click "track-adapt" instead.
 */
function advanceToPrefill() {
  advanceToTrack();
  fireEvent.click(screen.getByTestId("track-copy"));
  fireEvent.click(screen.getByTestId("project-name-next"));
}

/**
 * Drive from "identity" to "B".
 * New order (issue #508): prefill-confirm now goes directly to "B".
 */
function advanceToB() {
  advanceToPrefill();
  fireEvent.click(screen.getByTestId("prefill-confirm"));
}

/**
 * Drive from "identity" to "carve".
 * New order (issue #508): prefill → B → carve (phaseB-complete lands on carve).
 */
function advanceToCarve() {
  advanceToB();
  fireEvent.click(screen.getByTestId("phaseB-complete"));
}

/** Drive from "identity" to "mechanisms". */
function advanceToMechanisms() {
  advanceToCarve();
  fireEvent.click(screen.getByTestId("carve-complete"));
}

/** Drive from "identity" to "F". */
function advanceToF() {
  advanceToMechanisms();
  fireEvent.click(screen.getByTestId("mechanisms-complete"));
  // Stage E (TouchGallery) is now inserted between mechanisms and F.
  fireEvent.click(screen.getByTestId("e-complete"));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Forward transition 1: prefill → B  (issue #508: was prefill → carve)
// ---------------------------------------------------------------------------

describe("SurveyView — prefill → B transition", () => {
  it("renders the B stage after Prefill onConfirm is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToPrefill();
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-confirm"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 2: B → carve  (issue #508: was carve → B)
// ---------------------------------------------------------------------------

describe("SurveyView — B → carve transition", () => {
  it("renders the carve stage after PhaseB onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-complete"));

    expect(screen.getByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 3: carve → mechanisms  (issue #508: was B → mechanisms)
// ---------------------------------------------------------------------------

describe("SurveyView — carve → mechanisms transition", () => {
  it("renders the mechanisms stage after CarveGallery onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-complete"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 4: mechanisms → F
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → F transition", () => {
  it("renders the F stage after MechanismGallery onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // mechanisms → E (TouchGallery) → F
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();

    fireEvent.click(screen.getByTestId("e-complete"));

    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 5: B → prefill  (issue #508: was carve → prefill)
// ---------------------------------------------------------------------------

describe("SurveyView — B → prefill back-navigation", () => {
  it("returns to prefill stage when PhaseB onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-back"));

    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 6: carve → B  (issue #508: was B → carve)
// ---------------------------------------------------------------------------

describe("SurveyView — carve → B back-navigation", () => {
  it("returns to B stage (not prefill) when CarveGallery onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-back"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
    // Confirm it did NOT go to prefill (the old pre-#508 behavior).
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 7: F → E  (Phase E inserted between mechanisms and F)
// ---------------------------------------------------------------------------

describe("SurveyView — F → E back-navigation", () => {
  it("returns to Phase E (touch gallery, not B) when PhaseF onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToF();
    expect(screen.getByTestId("stage-F")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseF-back"));

    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-F")).toBeNull();
    // Confirm it did NOT go back to B (the old behavior).
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 8: mechanisms → carve  (issue #508: was mechanisms → B)
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → carve back-navigation", () => {
  it("returns to carve stage (not B) when MechanismGallery onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mechanisms-back"));

    expect(screen.getByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
    // Confirm it did NOT go to B (the old pre-#508 behavior).
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StudioShell routing regression — #preview mounts PreviewScreen and #output
// mounts OutputScreen (distinct screens, NOT RoutePlaceholder).
// ---------------------------------------------------------------------------

describe("StudioShell — route: #preview renders PreviewScreen", () => {
  it("mounts PreviewScreen (not RoutePlaceholder) when hash is #preview", async () => {
    window.location.hash = "#preview";

    await act(async () => {
      render(<StudioShell />);
    });

    // PreviewScreen stub must be present.
    expect(screen.getByTestId("preview-screen-root")).toBeTruthy();
    // OutputScreen must NOT be present — these are distinct screens.
    expect(screen.queryByTestId("output-screen-root")).toBeNull();
    // RoutePlaceholder renders "Preview — coming soon"; must NOT be present.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

describe("StudioShell — route: #output renders OutputScreen", () => {
  it("mounts OutputScreen (not RoutePlaceholder) when hash is #output", async () => {
    window.location.hash = "#output";

    await act(async () => {
      render(<StudioShell />);
    });

    // OutputScreen stub must be present.
    expect(screen.getByTestId("output-screen-root")).toBeTruthy();
    // PreviewScreen must NOT be present — these are distinct screens.
    expect(screen.queryByTestId("preview-screen-root")).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StudioShell / SurveyView — done stage calls navigateTo('output')
// ---------------------------------------------------------------------------

describe("SurveyView — PhaseF done navigates to #output", () => {
  it("calls navigateTo('output') when PhaseF onComplete fires", async () => {
    window.location.hash = "#survey";

    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToF();
    expect(screen.getByTestId("stage-F")).toBeTruthy();

    // Fire PhaseF completion.
    await act(async () => {
      fireEvent.click(screen.getByTestId("phaseF-complete"));
    });

    // navigateTo should have been called with 'output'.
    expect(navigateTo).toHaveBeenCalledWith("output");
  });
});

// ---------------------------------------------------------------------------
// Back from Phase E returns to "mechanisms" stage
// ---------------------------------------------------------------------------

describe("SurveyView — Phase E back-navigation returns to mechanisms", () => {
  it("onBack passed to TouchGallery sets stage to mechanisms", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Advance to Phase E.
    advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Click the back button in the Phase E mock.
    fireEvent.click(screen.getByTestId("e-back"));

    // Should be back at mechanisms.
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
  });

  it("after returning to mechanisms from E, can advance to E again", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Advance to Phase E.
    advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Go back to mechanisms.
    fireEvent.click(screen.getByTestId("e-back"));
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // Advance forward again — the mechanisms "Complete" button still calls onComplete.
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Track 2 (Adapt) routing — issue #388
// ---------------------------------------------------------------------------
//
// The Track 2 path clicks "track-adapt" instead of "track-copy", which skips
// the project-name step and calls instantiateFromExisting (not instantiateFromBase).
//
// useKeyboardArtifact is mocked to return { stage: { kind: "idle" } } which means
// onInstantiate never fires in this shallow test. We can still verify the ROUTING
// shape (which stage the wizard advances to, and that instantiationMode stays null
// because the mock onInstantiate never fires). A deeper integration test would
// require a real VFS/IR compile cycle — that belongs in a separate integration test.
//
// What this test covers:
//   - Clicking "track-adapt" advances to "prefill" (skips project-name).
//   - The project-name stage is NOT rendered on the adapt path.
//   - After clicking track-adapt, instantiationMode remains null (onInstantiate
//     never fires in this mock — the routing test confirms stage progression, not
//     store instantiation, which is covered exhaustively in workingCopyStore.test.ts).

describe("SurveyView — Track 2 (adapt) routing", () => {
  it("clicking track-adapt advances to prefill, skipping project-name", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Drive to the track stage.
    advanceToTrack();
    expect(screen.getByTestId("stage-track")).toBeTruthy();

    // Click adapt (Track 2).
    fireEvent.click(screen.getByTestId("track-adapt"));

    // Should be at prefill, not project-name.
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
    expect(screen.queryByTestId("stage-track")).toBeNull();
  });

  it("track-copy still advances through project-name to prefill (regression guard)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToTrack();
    fireEvent.click(screen.getByTestId("track-copy"));

    // Should be at project-name, not prefill yet.
    expect(screen.getByTestId("stage-project-name")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();

    // Advance through project-name.
    fireEvent.click(screen.getByTestId("project-name-next"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defect B regression — handlePhaseEComplete applies assignments to output
// ---------------------------------------------------------------------------
//
// handlePhaseEComplete must call setTouchLayoutJson with JSON derived from
// buildTouchLayoutJson(baseIr, assignments) — NOT scaffoldTouchLayout(ir)
// with the assignments ignored. We seed baseIr into the store, emit a
// longpress assignment from the TouchGallery mock, and assert the stored
// touchLayoutJson contains the assignment data.

describe("SurveyView — handlePhaseEComplete applies assignments to output (Defect B)", () => {
  it("setTouchLayoutJson is called with JSON containing the emitted assignment", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Seed baseIr into the store so handlePhaseEComplete can call buildTouchLayoutJson.
    // The mock buildTouchLayoutJson serialises its `assignments` arg into the JSON,
    // so we can assert the round-trip without touching real engine code.
    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Set the assignments the TouchGallery mock will emit when e-complete fires.
    // A longpress of "ä" on K_A is the canonical Defect B example.
    const longpressAssignment = {
      scope: "individual" as const,
      target: "ä",
      modality: "touch" as const,
      mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "ä" } }],
      source: "user" as const,
    };
    _mockTouchEAssignmentsRef.current = [longpressAssignment];

    // Navigate to stage E and fire the TouchGallery complete button.
    advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    // Stage E is now shown.
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // The mock buildTouchLayoutJson encodes the assignments into the JSON.
    // Verify the stored touchLayoutJson contains the assignment target "ä".
    const stored = useWorkingCopyStore.getState().touchLayoutJson;
    expect(stored).not.toBeNull();
    expect(stored).toContain("longpress_alternates");
    expect(stored).toContain("K_A");
  });

  it("setTouchLayoutJson(null) when baseIr is null (no real edits possible)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // baseIr is null — store is not seeded. handlePhaseEComplete must call
    // setTouchLayoutJson(null) rather than attempting to build a layout.
    _mockTouchEAssignmentsRef.current = [];

    advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // Store baseIr is null → touchLayoutJson must remain null.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("setTouchLayoutJson(null) when assignments is empty even with baseIr set", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Seed baseIr so the branch condition is clear: assignments empty → null,
    // regardless of baseIr presence.
    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Empty assignments — no real touch edits were made.
    _mockTouchEAssignmentsRef.current = [];

    advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // No real edits → touchLayoutJson must be null so serializeWorkingCopy
    // leaves the VFS untouched and KMW uses its native default.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });
});
