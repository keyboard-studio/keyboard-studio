// Unit tests for SurveyView stage-machine transitions.
//
// Coverage: the 4 new forward transitions added in PR #403 (prefill→carve,
// carve→B, B→mechanisms, mechanisms→F) plus the 3 back-navigation changes
// (carve→prefill, B→carve, F→mechanisms).
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
  mockPrefillConfirmRef,
  mockCarveDoneRef,
  mockCarveBackRef,
  mockPhaseBDoneRef,
  mockPhaseBBackRef,
  mockMechDoneRef,
  mockMechBackRef,
  mockPhaseFDoneRef,
  mockPhaseFBackRef,
} = vi.hoisted(() => {
  // These refs are updated by mock components so the latest callback is always
  // available to the test when it fires a button click.
  const mockIdentityCompleteRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockBaseResolvedRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPrefillConfirmRef = { current: null as null | (() => void) };
  const mockPrefillBackRef = { current: null as null | (() => void) };
  const mockCarveDoneRef = { current: null as null | (() => void) };
  const mockCarveBackRef = { current: null as null | (() => void) };
  const mockPhaseBDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseBBackRef = { current: null as null | (() => void) };
  const mockMechDoneRef = { current: null as null | (() => void) };
  const mockMechBackRef = { current: null as null | (() => void) };
  const mockPhaseFDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseFBackRef = { current: null as null | (() => void) };
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

vi.mock("./components/BaseResolution.tsx", () => ({
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

vi.mock("./components/CarveGallery.tsx", () => ({
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

vi.mock("./components/MechanismGallery.tsx", () => ({
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

vi.mock("./components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: ({ script }: { script: string }) => (
    <div data-testid="stage-unsupported">{script}</div>
  ),
}));

vi.mock("./components/TrackStep.tsx", () => ({
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

vi.mock("./components/ProjectNameStep.tsx", () => ({
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

// ---------------------------------------------------------------------------
// Import the component under test — AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { SurveyView } from "./StudioShell.tsx";

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

/** Drive from "identity" to "carve". */
function advanceToCarve() {
  advanceToPrefill();
  fireEvent.click(screen.getByTestId("prefill-confirm"));
}

/** Drive from "identity" to "B". */
function advanceToB() {
  advanceToCarve();
  fireEvent.click(screen.getByTestId("carve-complete"));
}

/** Drive from "identity" to "mechanisms". */
function advanceToMechanisms() {
  advanceToB();
  fireEvent.click(screen.getByTestId("phaseB-complete"));
}

/** Drive from "identity" to "F". */
function advanceToF() {
  advanceToMechanisms();
  fireEvent.click(screen.getByTestId("mechanisms-complete"));
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
// Forward transition 1: prefill → carve
// ---------------------------------------------------------------------------

describe("SurveyView — prefill → carve transition", () => {
  it("renders the carve stage after Prefill onConfirm is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToPrefill();
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-confirm"));

    expect(screen.getByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 2: carve → B
// ---------------------------------------------------------------------------

describe("SurveyView — carve → B transition", () => {
  it("renders the B stage after CarveGallery onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-complete"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 3: B → mechanisms
// ---------------------------------------------------------------------------

describe("SurveyView — B → mechanisms transition", () => {
  it("renders the mechanisms stage after PhaseB onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-complete"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();
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

    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 5: carve → prefill
// ---------------------------------------------------------------------------

describe("SurveyView — carve → prefill back-navigation", () => {
  it("returns to prefill stage when CarveGallery onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-back"));

    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 6: B → carve  (changed from B → prefill in PR #403)
// ---------------------------------------------------------------------------

describe("SurveyView — B → carve back-navigation", () => {
  it("returns to carve stage (not prefill) when PhaseB onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-back"));

    expect(screen.getByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();
    // Confirm it did NOT go to prefill (the old behavior).
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 7: F → mechanisms  (changed from F → B in PR #403)
// ---------------------------------------------------------------------------

describe("SurveyView — F → mechanisms back-navigation", () => {
  it("returns to mechanisms stage (not B) when PhaseF onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToF();
    expect(screen.getByTestId("stage-F")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseF-back"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-F")).toBeNull();
    // Confirm it did NOT go back to B (the old behavior).
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 8: mechanisms → B
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → B back-navigation", () => {
  it("returns to B stage (not carve) when MechanismGallery onBack is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mechanisms-back"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
    // Confirm it did NOT go to carve (an adjacent stage).
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });
});
