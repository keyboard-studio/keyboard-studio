// Unit tests for SurveyView manifest-driven step transitions (T028/T029).
//
// Coverage:
//   T028 — manifest-driven SurveyView: forward and back transitions driven by the
//           manifest step order (identity → choose_base → track → [project_name] →
//           characters → marks → carve → mechanisms → touch →
//           help → done). No SurveyStage union. The marks step (spec 046) is
//           NOT mocked — the marks-free test alphabet makes its S0 gate
//           auto-complete without rendering, so walks hop it invisibly.
//   T029 — no SurveyStage symbol; runtime step order matches manifest; applyStepCompletion
//           is wired for side-effecting steps.
//
// Manifest order (FR-012): Characters BEFORE Carve. The old SurveyStage code
// already had this order (B → carve); the new manifest preserves it.
// track and project_name are now real manifest steps (P0 fix from review).
//
// Strategy: mock every child component at the shallowest level so each mock
// renders a unique data-testid and a single button that fires its callback.
// Heavy hook dependencies (useKeyboardArtifact, useWorkingCopyTransform,
// instantiateFromBaseIfConfirmed) are mocked to keep WASM and VFS out of the
// picture. Navigation to a starting stage is achieved by clicking through the
// sequence of mocked buttons that lead up to it.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState, useEffect } from "react";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore, snapshotTraversal } from "./stores/surveySessionStore.ts";
import { snapshotWorkingCopyData } from "./lib/persistWorkingCopy.ts";
import type { OnInstantiateCallback, Stage } from "./hooks/useKeyboardArtifact.ts";

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

// Mock survey/FlowStepHost.tsx — used directly by factory components for
// track, project_name, and phase_f_helpdocs (spec 029 convergence).
// Branches on flow.flow_id to emit the same testids as the old wrapper stubs.
vi.mock("./survey/FlowStepHost.tsx", () => {
  const fakePhaseResult = { phase: "B" as const, answers: [], confirmedInventory: [] };

  return {
    FlowStepHost: ({
      flow,
      onComplete,
      onBack,
    }: {
      flow: { flow_id: string };
      onComplete: (result: unknown) => void;
      onBack?: () => void;
    }) => {
      if (flow.flow_id === "track") {
        return (
          <div data-testid="stage-track">
            <button
              type="button"
              data-testid="track-copy"
              onClick={() =>
                onComplete({
                  phase: "G",
                  answers: [{ questionId: "track_choice", answerType: "select", value: "copy" }],
                  confirmedInventory: [],
                })
              }
            >
              track-copy
            </button>
            <button
              type="button"
              data-testid="track-adapt"
              onClick={() =>
                onComplete({
                  phase: "G",
                  answers: [{ questionId: "track_choice", answerType: "select", value: "adapt" }],
                  confirmedInventory: [],
                })
              }
            >
              track-adapt
            </button>
            {onBack !== undefined && (
              <button type="button" data-testid="track-back" onClick={onBack}>
                track-back
              </button>
            )}
          </div>
        );
      }
      if (flow.flow_id === "project_name") {
        return (
          <div data-testid="stage-project-name">
            <button
              type="button"
              data-testid="project-name-next"
              onClick={() =>
                onComplete({
                  phase: "G",
                  answers: [
                    { questionId: "project_display_name", answerType: "text", value: "Test Keyboard" },
                    { questionId: "project_keyboard_id", answerType: "text", value: "test_keyboard" },
                  ],
                  confirmedInventory: [],
                })
              }
            >
              project-name-next
            </button>
            {onBack !== undefined && (
              <button type="button" data-testid="project-name-back" onClick={onBack}>
                project-name-back
              </button>
            )}
          </div>
        );
      }
      if (flow.flow_id === "phase_f_helpdocs") {
        _mockPhaseFDoneRef.current = onComplete;
        _mockPhaseFBackRef.current = onBack ?? null;
        return (
          <div data-testid="stage-F">
            <button
              type="button"
              data-testid="phaseF-complete"
              onClick={() => onComplete(fakePhaseResult)}
            >
              phaseF-complete
            </button>
            {onBack !== undefined && (
              <button type="button" data-testid="phaseF-back" onClick={onBack}>
                phaseF-back
              </button>
            )}
          </div>
        );
      }
      return <div data-testid={`flow-stub-${flow.flow_id}`} />;
    },
  };
});

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
    // PhaseA re-exported as a no-op (not used in the wizard path under test)
    PhaseA: () => <div data-testid="stage-A" />,
    SurveyRunner: () => <div data-testid="survey-runner" />,
    extractIdentityLite: (r: unknown) => r,
    extractIdentity: () => ({}),
    extractProvenance: () => ({}),
    buildPrefillRows: () => [],
  };
});

// BaseResolution mock — preview-before-commit contract. Two separate buttons
// mirror the two real user actions (a suggestion-card click fires onPreview;
// the "Choose this keyboard" button fires onConfirm) as two SEPARATE click
// events, not one — the real BaseResolutionAdapter's onConfirm closes over
// the store's localBase from ITS OWN render, so a preview must be allowed to
// flush (and the adapter re-render with the new onConfirm closure) before
// confirm fires, exactly as two distinct user clicks would.
vi.mock("./editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: ({
    onPreview,
    onConfirm,
    previewedBase,
    onBack,
  }: {
    onPreview: (base: unknown) => void;
    onConfirm: () => void;
    previewedBase: unknown;
    previewStatus: string;
    onBack?: () => void;
  }) => {
    _mockBaseResolvedRef.current = onConfirm;
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
        <button type="button" data-testid="base-preview" onClick={() => onPreview(fakeBase)}>
          base-preview
        </button>
        <button
          type="button"
          data-testid="base-confirm"
          disabled={previewedBase === null}
          onClick={onConfirm}
        >
          base-confirm
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

// TouchSeedSourcePanel mock (spec 035 T014/T012) — registerEditorSteps.ts now
// renders this for the "touch_seed_source" step (the "touch" step keeps the
// TouchGallery mock above, unchanged). Two confirm buttons let R11 emission
// tests pick either fork choice; each mirrors the real component's behavior
// of setting surveySessionStore.touchSeedSource BEFORE calling onComplete.
vi.mock("./editors/touchSeedSource/TouchSeedSourcePanel.tsx", () => ({
  TouchSeedSourcePanel: ({
    onComplete,
    onBack,
  }: {
    onComplete: (result: unknown) => void;
    onBack?: () => void;
  }) => {
    const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);
    return (
      <div data-testid="stage-seed-source">
        <button
          type="button"
          data-testid="seed-source-complete"
          onClick={() => {
            setTouchSeedSource("import-adapt");
            onComplete(undefined);
          }}
        >
          seed-source-complete
        </button>
        <button
          type="button"
          data-testid="seed-source-reseed-complete"
          onClick={() => {
            setTouchSeedSource("reseed-from-desktop");
            onComplete(undefined);
          }}
        >
          seed-source-reseed-complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="seed-source-back" onClick={onBack}>
            seed-source-back
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

// Opt-in controllable useKeyboardArtifact mock (precedent:
// StudioShell.previewCommitGating.test.tsx's `hoisted`/`settleFor`). By
// default every test still gets the original static `{ kind: "idle" }` stage
// with onInstantiate never firing — nothing here changes unless a test
// explicitly drives `artifactHoisted.onInstantiateRef.current` /
// `artifactHoisted.stageSetters` (see the "resume draft banner" describe
// block's F1/P1 regression test below).
const artifactHoisted = vi.hoisted(() => ({
  onInstantiateRef: { current: null as OnInstantiateCallback | null },
  stageSetters: [] as Array<(s: Stage) => void>,
}));

vi.mock("./hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _base: unknown,
    _spec: unknown,
    _transform: unknown,
    onInstantiate: OnInstantiateCallback | null | undefined,
  ) => {
    artifactHoisted.onInstantiateRef.current = onInstantiate ?? null;
    const [stage, setStage] = useState<Stage>({ kind: "idle" });
    useEffect(() => {
      artifactHoisted.stageSetters.push(setStage);
      return () => {
        artifactHoisted.stageSetters = artifactHoisted.stageSetters.filter((f) => f !== setStage);
      };
    }, []);
    return { stage, retry: vi.fn(), recompile: vi.fn() };
  },
}));

vi.mock("./hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

vi.mock("./lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
  // BaseResolutionAdapter's onConfirm calls confirmRebaseTo synchronously
  // (F1 fix) before advancing; every scenario here starts from a fresh,
  // uninstantiated working copy, so mocking it to always allow keeps these
  // tests exercising the same flows as before the fix.
  confirmRebaseTo: vi.fn(() => true),
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

vi.mock("./components/WelcomeScreen.tsx", () => ({
  WelcomeScreen: () => <div data-testid="welcome-screen-root">welcome-screen</div>,
}));

// Shallow stub for DashboardView — only rendered in dev/VITE_SHOW_FLOWMAP builds.
vi.mock("./dashboard/DashboardView.tsx", () => ({
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
import { markVisited } from "./lib/firstVisit.ts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { instantiateFromBaseIfConfirmed, confirmRebaseTo } from "./lib/confirmRebase.ts";
import {
  saveDraft,
  loadDraft,
  deriveProjectKeyFromWorkingCopy,
  draftKey,
  PENDING_PROJECT_KEY,
  AUTOSAVE_DEBOUNCE_MS,
  type DurableDraft,
} from "./lib/draftPersistence.ts";

const instantiateSpy = instantiateFromBaseIfConfirmed as ReturnType<typeof vi.fn>;
const confirmRebaseToSpy = confirmRebaseTo as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drive the wizard from "identity" to "base" (click identity-complete). */
function advanceToBase() {
  fireEvent.click(screen.getByTestId("identity-complete"));
}

/**
 * Drive from "identity" to "track" (identity → base → track).
 * Two SEPARATE fireEvent.click calls (preview, then confirm) — mirrors two
 * real user clicks with a render flush in between (preview-before-commit).
 */
function advanceToTrack() {
  advanceToBase();
  fireEvent.click(screen.getByTestId("base-preview"));
  fireEvent.click(screen.getByTestId("base-confirm"));
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
 * New order (issue #508): prefill → B → carve — phaseB-complete lands on carve
 * via the marks step's S0 auto-skip (spec 046; marks-free test alphabet) and the
 * convenience step's own skip.
 *
 * ASYNC since spec 057. The convenience step deliberately holds its gate until
 * the CLDR/SLDR exemplar lookup settles, and `useCarveNeededSet` only settles
 * synchronously when there is NO language to look up. Track 1 now carries the
 * author's composed BCP47 tag into the working copy (FR-001) — which is the point
 * of that feature — so the lookup genuinely runs and the walk past B is genuinely
 * asynchronous. Awaiting the landing stage is what that costs; asserting
 * synchronously here would only pass while Track 1 had no language at all.
 */
async function advanceToCarve() {
  advanceToB();
  fireEvent.click(screen.getByTestId("phaseB-complete"));
  await screen.findByTestId("stage-carve");
}

/** Drive from "identity" to "mechanisms". */
async function advanceToMechanisms() {
  await advanceToCarve();
  fireEvent.click(screen.getByTestId("carve-complete"));
}

/** Drive from "identity" to "touch_seed_source" (the seed-source fork chooser). */
async function advanceToTouchSeedSource() {
  await advanceToMechanisms();
  fireEvent.click(screen.getByTestId("mechanisms-complete"));
}

/** Drive from "identity" to "F". */
async function advanceToF() {
  await advanceToTouchSeedSource();
  // touch_seed_source fork (spec 035 R4/R12, no choice recorded yet on a fresh
  // walk) renders the mocked TouchSeedSourcePanel chooser; confirming it lands
  // on the real "touch" step (mocked TouchGallery stub, "e-complete").
  fireEvent.click(screen.getByTestId("seed-source-complete")); // touch_seed_source -> touch
  fireEvent.click(screen.getByTestId("e-complete")); // touch -> F
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  artifactHoisted.onInstantiateRef.current = null;
  artifactHoisted.stageSetters = [];
});

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
  // The first-visit gate reads ks.visited / the ks.studio.draft key from
  // localStorage; clear it so gate state can't leak between tests.
  localStorage.clear();
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

    // Async landing: the convenience step waits on the exemplar lookup now that
    // Track 1 carries a language tag (spec 057) — see advanceToCarve.
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();
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

    await advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-complete"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 4: mechanisms → touch_seed_source fork → touch → F
//
// Sequences (S-03) are now built inline in the Mechanism Gallery's method
// chooser (the right-hand preview pane swaps for the builder when "sequence"
// is selected) — there is no separate "sequences" step between mechanisms
// and the touch_seed_source fork.
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → F transition", () => {
  it("renders the touch_seed_source fork after MechanismGallery onComplete is called", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // mechanisms → touch_seed_source fork (spec 035 R4/R12)
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();

    // Confirming the fork (no choice recorded yet on a fresh walk) lands on
    // the real "touch" step (mocked TouchGallery stub, stage-E).
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();

    fireEvent.click(screen.getByTestId("e-complete"));

    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P0 regression guard: touch_seed_source must NOT co-mount the outer
// persistent right-pane OSKFrame (spec 035 R4b follow-up).
//
// TouchSeedSourcePanel now renders its own inline live OSK preview. Before
// this fix, touch_seed_source was an ordinary "pane" step, so SurveyView's
// two-pane shell ALSO mounted its own persistent right-pane <OSKFrame> at
// the same time — two live OSKs on screen, with the outer one showing the
// working copy's DESKTOP preview instead of the selected touch seed. Giving
// touch_seed_source layout:"full" makes SurveyView early-return the step's
// own full-screen container (same mechanism as carve/mechanisms/touch),
// which never reaches the two-pane shell that mounts the outer OSKFrame.
//
// This test mocks TouchSeedSourcePanel (as the rest of this file does) so it
// renders no "osk-frame" testid of its own — meaning if the outer, persistent
// OSKFrame (mocked at the top of this file to always render
// data-testid="osk-frame") is EVER absent while on this step, the fix holds;
// if it reappears, this test fails and the regression is caught. Paired with
// TouchSeedSourcePanel.test.tsx's own "mounts the real OSK forced into
// touch/mobile mode" test — which proves the panel renders exactly one real
// OSK — the two tests together prove exactly one OSK is ever on screen for
// this step (the specific "both sides mocked in isolation" gap QC flagged).
// ---------------------------------------------------------------------------

describe("SurveyView — touch_seed_source suppresses the outer OSK pane (P0 fix)", () => {
  it("does not mount the outer persistent OSKFrame while touch_seed_source is active", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // The outer, persistent right-pane OSKFrame is mocked to unconditionally
    // render data-testid="osk-frame" wherever it is mounted. TouchSeedSourcePanel
    // is mocked above and renders no such testid itself, so ANY "osk-frame"
    // node here can only have come from SurveyView's own two-pane shell — the
    // exact redundant mount this fix removes.
    expect(screen.queryByTestId("osk-frame")).toBeNull();

    // Sanity check the mock actually renders "osk-frame" elsewhere (i.e. this
    // isn't a false negative from the mock never firing) — confirm it DOES
    // show up on a genuine two-pane ("pane" layout) step, e.g. "characters".
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    fireEvent.click(screen.getByTestId("e-complete")); // touch -> F (pane layout)
    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
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

    await advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-back"));

    // The back-pop crosses the convenience step, which re-runs its exemplar
    // lookup on re-entry and stays transparent in the direction of travel — so
    // the landing is async in both directions (spec 057; see advanceToCarve).
    expect(await screen.findByTestId("stage-B")).toBeTruthy();
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

    await advanceToF();
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

    await advanceToMechanisms();
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
    localStorage.setItem("ks.visited", "1"); // returning visitor: deep-link hash is honored

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
    localStorage.setItem("ks.visited", "1"); // returning visitor: deep-link hash is honored

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

describe("StudioShell — first-visit gate forces newcomers to welcome", () => {
  it("forces WelcomeScreen for a never-visited browser arriving on a deep-linked #preview hash", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // pristine browser: never visited

    await act(async () => {
      render(<StudioShell />);
    });

    // The deep-linked #preview is overridden — a genuine newcomer lands on
    // welcome (the shallow WelcomeScreen stub above, per this file's routing-
    // test idiom).
    expect(screen.queryByTestId("preview-screen-root")).toBeNull();
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    // The hash is rewritten to #welcome so leaving welcome fires a real hashchange.
    expect(window.location.hash).toBe("#welcome");
  });

  it("honors the deep-linked hash once the browser has visited", async () => {
    window.location.hash = "#preview";
    localStorage.setItem("ks.visited", "1"); // returning visitor

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("preview-screen-root")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StudioShell first-visit landing gate (proposal §9). With no explicit hash:
//   • a true first-time visitor lands on the WelcomeScreen;
//   • a returning visitor (ks.visited) or one with a resumable draft skips
//     welcome and lands in the survey.
// An explicit valid hash (#preview/#output/#survey) wins for a RETURNING
// visitor or once a resumable draft exists — see the route regressions above
// (both now set ks.visited to represent that case). A genuine first-time
// visitor (never visited, no draft) always lands on WelcomeScreen first, even
// on a deep-linked hash — see the two tests below.
// ---------------------------------------------------------------------------

describe("StudioShell — first-visit landing gate", () => {
  // Seeds the NEW per-project scheme directly (specs/037-my-keyboards), rather
  // than the legacy `ks.studio.draft` key: this describe block renders the
  // statically-imported StudioShell (no vi.resetModules()), so the module-init
  // migrateLegacyDraft() call already ran once for the whole file and will not
  // re-run per test — a legacy-key seed here would never be adopted. The
  // "resume draft banner" describe block below (which DOES re-import the
  // module per test) is what exercises the legacy-key migration path itself.
  function seedResumableDraft() {
    const projectKey = "__pending__";
    const savedAt = Date.now();
    localStorage.setItem(
      `ks.studio.project.${projectKey}`,
      JSON.stringify({
        version: 1,
        savedAt,
        survey: { activeStepId: "identity", identityResult: null, scaffoldSpec: null, history: [] },
        workingCopy: null,
      }),
    );
    localStorage.setItem(
      "ks.studio.projects.index",
      JSON.stringify([
        { projectKey, savedAt, activeStepId: "identity", label: null, langTag: null, status: "draft", prUrl: null },
      ]),
    );
    localStorage.setItem("ks.studio.activeProject", projectKey);
  }

  it("mounts WelcomeScreen (not the survey) on a first visit with no hash", async () => {
    window.location.hash = "";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    // The survey wizard's first step must NOT be present.
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("falls back to WelcomeScreen for an unknown hash on a first visit", async () => {
    window.location.hash = "#does-not-exist";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
  });

  it("skips welcome and lands in the survey for a returning visitor", async () => {
    window.location.hash = "";
    localStorage.clear();
    localStorage.setItem("ks.visited", "1"); // browser has entered the app before

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("skips welcome and lands in the survey when a resumable draft exists", async () => {
    window.location.hash = "";
    localStorage.clear();
    // A minimally-valid draft (version + savedAt + survey) so loadDraftMeta()
    // returns non-null; the survey route surfaces the resume banner.
    seedResumableDraft();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("forces WelcomeScreen for a first-time visitor arriving on a deep-linked #survey hash", async () => {
    window.location.hash = "#survey";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("forces WelcomeScreen for a first-time visitor arriving on a deep-linked #preview hash", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("preview-screen-root")).toBeNull();
  });

  it("lifts the gate on a live hashchange once the newcomer leaves welcome (no remount)", async () => {
    window.location.hash = "#survey";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    // A newcomer is forced onto welcome even on a deep-linked #survey hash, and
    // that hash is normalized to #welcome. Without this normalization the
    // WelcomeScreen "I'm new" button's navigateTo("survey") would be a
    // same-value hash assignment that fires zero hashchange events, soft-locking
    // the user on welcome.
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(window.location.hash).toBe("#welcome");

    // Leaving welcome marks the browser visited; the button then navigates to
    // #survey. Drive that live transition on the SAME mount: the gate must lift
    // and the route re-resolve to survey on the next hashchange, WITHOUT the
    // component remounting (the test never re-renders StudioShell).
    await act(async () => {
      markVisited();
      window.location.hash = "#survey";
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("honors a deep-linked #preview hash for a never-visited browser once a resumable draft exists", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // never visited...
    // ...but a resumable draft lifts the newcomer gate. Same minimally-valid
    // draft shape used by the "resumable draft exists" test above.
    seedResumableDraft();

    await act(async () => {
      render(<StudioShell />);
    });

    // Gate lifted by the draft ⇒ the deep-linked hash is honored: land on
    // preview, NOT forced onto welcome and NOT defaulted to survey.
    expect(screen.getByTestId("preview-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StudioShell — resume draft banner (ResumeDraftBanner.tsx, lib/draftAutosave.ts).
//
// The gap closed here: the "first-visit landing gate" tests above only assert
// ROUTING (stage-identity present) when a resumable draft exists — none of them
// assert that the banner itself renders, or that Resume/Discard actually
// hydrate/clear state. This block does.
//
// Order-dependence hazard (StudioShell.tsx): the resume offer is gated by a
// MODULE-LEVEL `resumeOfferConsumed` flag that flips to true on the first
// SurveyView mount of the JS context (StrictMode-safe: read in the lazy
// useState initializer, flipped in the mount effect so it survives double-
// invocation). Many tests earlier in this file already mount SurveyView/
// StudioShell, so by the time this block runs the flag is already true and a
// plain `render(<StudioShell />)` would never show the banner regardless of
// whether a draft exists. Each test below uses vi.resetModules() + a fresh
// dynamic import of StudioShell.tsx to get a pristine module instance (flag
// unconsumed), exactly like a real page load starting a new JS context. Same
// technique already used for a different module-level singleton in
// survey/SurveyRunner.pinChip.test.tsx (see importSurveyRunner() there).
// ---------------------------------------------------------------------------

describe("StudioShell — resume draft banner", () => {
  /**
   * Seed a well-formed resumable draft. activeStepId defaults to "choose_base"
   * (not "identity") so a post-Resume hydration is independently observable:
   * the wizard should show the BaseResolution stage ("stage-base") instead of
   * staying on the "identity" stage the pre-Resume reset() puts it on.
   */
  function seedResumableDraft(activeStepId: string = "choose_base") {
    localStorage.setItem(
      "ks.studio.draft",
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: { activeStepId, identityResult: null, scaffoldSpec: null, history: [] },
        // Explicit null (not omitted): applyDraft() only skips
        // applyWorkingCopySnapshot when this is === null, so an omitted key
        // (undefined after JSON.parse) would crash it on Resume.
        workingCopy: null,
      }),
    );
  }

  /** Fresh StudioShell module instance (see order-dependence note above). */
  async function renderFreshStudioShell() {
    vi.resetModules();
    const mod = await import("./StudioShell.tsx");
    await act(async () => {
      render(<mod.StudioShell />);
    });
  }

  it("renders resume-draft-banner on the survey route when a resumable draft exists", async () => {
    window.location.hash = "";
    localStorage.clear();
    seedResumableDraft();

    await renderFreshStudioShell();

    expect(screen.getByTestId("resume-draft-banner")).toBeTruthy();
    // Confirms the landing gate (already covered above) and the banner agree.
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("Resume dismisses the banner and hydrates the survey to the draft's activeStepId", async () => {
    window.location.hash = "";
    localStorage.clear();
    seedResumableDraft(); // draft.survey.activeStepId === "choose_base"

    await renderFreshStudioShell();

    // Pre-Resume: the mount-effect reset() has put the store back on
    // "identity" (spec: reset does not touch the localStorage draft), and the
    // banner is offered independently of that reset.
    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.getByTestId("resume-draft-banner")).toBeTruthy();

    fireEvent.click(screen.getByTestId("resume-draft"));

    // Banner dismissed.
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    // Observable hydration outcome: the wizard now reflects the draft's
    // activeStepId ("choose_base" -> the BaseResolution stage), not "identity".
    expect(screen.getByTestId("stage-base")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("Discard dismisses the banner and clears the draft from localStorage", async () => {
    window.location.hash = "";
    localStorage.clear();
    seedResumableDraft();

    await renderFreshStudioShell();

    expect(screen.getByTestId("resume-draft-banner")).toBeTruthy();
    // Migration (module-init migrateLegacyDraft(), re-run fresh here via
    // vi.resetModules()) has already adopted the legacy draft into the new
    // per-project scheme by the time StudioShell mounts — the legacy key is
    // gone, and the project lives under its derived key ("__pending__", since
    // this seeded draft has no working copy) with the active-project pointer
    // set to it.
    expect(localStorage.getItem("ks.studio.draft")).toBeNull();
    expect(localStorage.getItem("ks.studio.activeProject")).toBe("__pending__");
    expect(localStorage.getItem("ks.studio.project.__pending__")).not.toBeNull();

    fireEvent.click(screen.getByTestId("discard-draft"));

    // Banner dismissed and the draft is gone: the active project's per-project
    // record + index row are removed, and the active-project pointer is cleared.
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    expect(localStorage.getItem("ks.studio.project.__pending__")).toBeNull();
    expect(localStorage.getItem("ks.studio.activeProject")).toBeNull();
    expect(JSON.parse(localStorage.getItem("ks.studio.projects.index") ?? "[]")).toEqual([]);
    // Discard does not hydrate — the wizard stays on "identity" (untouched).
    expect(screen.getByTestId("stage-identity")).toBeTruthy();
  });

  // F1/P1 regression: résumé pre-seeds instantiatedForBaseIdRef with the
  // restored base id (see StudioShell.tsx handleResumeDraft) so a compile
  // settle that fires AFTER résumé — for that SAME base — does not re-run
  // doCommit (no second instantiateFromBaseIfConfirmed call) and, since it
  // never reaches BaseResolutionAdapter.onConfirm, never pops the rebase
  // confirm dialog either.
  it("a pipeline settle for the restored base AFTER résumé does not re-instantiate or confirm", async () => {
    window.location.hash = "";
    localStorage.clear();

    // Build a REAL working-copy + traversal snapshot (base confirmed, exactly
    // as a session that reached choose_base's commit before the reload) using
    // the top-level (pre-resetModules) stores, then hand it to the legacy
    // draft key the same way seedResumableDraft() does above — migrateLegacyDraft()
    // adopts it into the per-project scheme when the FRESH module loads.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: makeTestIR([]),
    });
    useSurveySessionStore.getState().setLocalBase(basicKbdus);
    useSurveySessionStore.getState().setBaseConfirmed(true);
    useSurveySessionStore.getState().advance("choose_base");

    localStorage.setItem(
      "ks.studio.draft",
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: snapshotTraversal(),
        workingCopy: snapshotWorkingCopyData(),
      }),
    );

    // The snapshot is captured — the top-level stores are no longer needed for
    // this test and must not leak into later tests in this file.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    await renderFreshStudioShell();

    expect(screen.getByTestId("resume-draft-banner")).toBeTruthy();
    fireEvent.click(screen.getByTestId("resume-draft"));
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    // Sanity: résumé actually restored the base into the fresh store/UI.
    expect(screen.getByTestId("stage-base")).toBeTruthy();

    // Simulate the compile pipeline settling AGAIN for the restored base
    // (e.g. Track 1's setScaffoldSpec() triggering a second compile run) —
    // fires onInstantiate then transitions the artifact stage to "ready",
    // mirroring the real pipeline's run() ordering.
    act(() => {
      artifactHoisted.onInstantiateRef.current?.(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: basicKbdus.id,
        } as unknown as Stage);
      }
    });

    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(confirmRebaseToSpy).not.toHaveBeenCalled();
  });

  // F5 regression (docs/design-notes/switch-base-popup-behavior-log.md):
  // draftPersistence's silent, boot-time restore (main.tsx's loadDraft(),
  // mirrored explicitly below since main.tsx itself isn't imported by this
  // test file) must not be followed by a SECOND, competing "Resume" offer
  // from the OTHER draft engine (lib/draftAutosave.ts, `ks.studio.*`) whose
  // coarser 1000ms debounce can legitimately lag behind and hold a STALER
  // step. Before the fix, that second banner rendered unconditionally and,
  // if resumed, silently regressed the wizard from the freshly-restored
  // "characters" step back to the OTHER engine's stale "track" snapshot —
  // exactly the observed F5 symptom (refresh lands 1-2 steps earlier).
  it("F5: no competing resume-draft-banner — and no step regression — when draftPersistence already silently restored this boot", async () => {
    window.location.hash = "";
    localStorage.clear();

    // Reach an L4-equivalent position (base confirmed, track chosen, on the
    // characters/prefill step) via the top-level (pre-resetModules) stores.
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: makeTestIR([]),
    });
    // identityResult must be non-null in the snapshot: the restored
    // CharactersStep renders null (its prefill guard) without it, which would
    // fail this test for a reason unrelated to F5.
    useSurveySessionStore.getState().setIdentityResult({
      autonym: "English",
      english: "English",
      languageSubtag: "en",
      targetScriptRaw: "Latn",
      bcp47: "en-Latn",
      supported: true,
      prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
    });
    useSurveySessionStore.getState().setLocalBase(basicKbdus);
    useSurveySessionStore.getState().setBaseConfirmed(true);
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("track");
    useSurveySessionStore.getState().advance("characters");

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    // The FRESH snapshot, via draftPersistence — this is what main.tsx's
    // silent boot restore will apply.
    saveDraft(projectKey!);

    // Seed a STALER record under the OTHER (draftAutosave) engine's OWN
    // storage scheme, simulating its coarser debounce never having caught up
    // past "track" (the exact "stuck one step behind" symptom from the
    // exploration log).
    localStorage.setItem("ks.studio.activeProject", projectKey!);
    localStorage.setItem(
      `ks.studio.project.${projectKey}`,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: {
          activeStepId: "track",
          identityResult: null,
          scaffoldSpec: null,
          history: ["identity", "choose_base"],
        },
        workingCopy: null,
      }),
    );
    localStorage.setItem(
      "ks.studio.projects.index",
      JSON.stringify([
        {
          projectKey,
          savedAt: Date.now(),
          activeStepId: "track",
          label: null,
          langTag: null,
          status: "draft",
          prUrl: null,
        },
      ]),
    );

    // Top-level stores are no longer needed for this test and must not leak
    // into later tests in this file.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    vi.resetModules();
    const mod = await import("./StudioShell.tsx");
    const draftPersistence = await import("./lib/draftPersistence.ts");

    // Mirror main.tsx's pre-mount silent restore EXACTLY.
    const activeKey = draftPersistence.resolveActiveProjectKey();
    expect(activeKey).toBe(projectKey);
    expect(draftPersistence.loadDraft(activeKey!)).toBe(true);

    await act(async () => {
      render(<mod.StudioShell />);
    });

    // No competing banner — the state was already silently restored.
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    // The correctly-restored step (characters/prefill) is on screen, NOT the
    // other engine's stale "track" step.
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-track")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F6 wiring regression (docs/design-notes/switch-base-popup-behavior-log.md):
// `promotePendingAutosave` (private to SurveyView) is exercised here through
// its three real call sites — doCommit (base confirm), the self-promote edge
// case, and handleStartOver's re-arm — rather than unit-tested directly,
// since it is not exported. Drives the real `installDraftAutosave`/
// `saveDraft`/`clearDraft` machinery in `lib/draftPersistence.ts` (NOT
// mocked in this file) against real localStorage, mirroring the F5 test
// above.
// ---------------------------------------------------------------------------
describe("F6 wiring: promotePendingAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) confirming a base promotes the pending autosave: the pending record is cleared and the real project key's record is written", async () => {
    localStorage.clear();

    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // L1 progress: identity-complete gives hasPendingProgress() a true reading
    // (identityResult !== null / activeStepId !== "identity").
    fireEvent.click(screen.getByTestId("identity-complete"));

    // Seed a REAL pending-slot record (as the mount-time autosave's own
    // debounced write would eventually do) so its removal below is an
    // observable state change, not a no-op on an absent key.
    saveDraft(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    // Preview the (mocked) base — sets localBase, arming the commit button.
    fireEvent.click(screen.getByTestId("base-preview"));

    // Drive the compile pipeline settle for that SAME base id ("basic_kbdus",
    // the mock's fakeBase — matches basicKbdus.id) and manually instantiate
    // the working copy, since `instantiateFromBaseIfConfirmed` is mocked to a
    // no-op for every test in this file (see the module-level vi.mock above) —
    // doCommit's own body does not depend on that mock actually instantiating;
    // it only needs a real working copy in place to derive a real project key.
    act(() => {
      useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
      });
      artifactHoisted.onInstantiateRef.current?.(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: basicKbdus.id,
        } as unknown as Stage);
      }
    });

    // Commit — fires doCommit → promotePendingAutosave.
    fireEvent.click(screen.getByTestId("base-confirm"));

    const realKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(realKey).toBe(basicKbdus.id);

    // The pending record is gone (item 1's index gating is orthogonal — this
    // is the RECORD, not the index row).
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBeNull();
    // installDraftAutosave's own synchronous install-time save (P1 fix) means
    // a record for the real key exists immediately, with no debounce wait.
    const stored = localStorage.getItem(draftKey(realKey!));
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored!) as DurableDraft).projectKey).toBe(realKey);
  });

  it("(b) self-promote: when the derived project key IS the pending key, the pending record survives (clearDraft is not reached)", async () => {
    localStorage.clear();
    // A base whose id is literally the reserved sentinel — a synthetic
    // edge case (never true of a real keyboard id) constructed purely to
    // force `deriveProjectKeyFromWorkingCopy` to resolve to the pending key
    // at the moment doCommit runs, so the `projectKey !== PENDING_PROJECT_KEY`
    // guard's FALSE branch is the one under test.
    const pendingIdBase = { ...basicKbdus, id: PENDING_PROJECT_KEY };

    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    fireEvent.click(screen.getByTestId("identity-complete"));
    saveDraft(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    act(() => {
      // Bypasses the mock BaseResolution's hardcoded fakeBase id (fixed at
      // "basic_kbdus") — setLocalBase directly, matching the real
      // BaseResolutionAdapter.onPreview effect.
      useSurveySessionStore.getState().setLocalBase(pendingIdBase);
      useWorkingCopyStore.getState().instantiateFromBase(pendingIdBase, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
      });
      artifactHoisted.onInstantiateRef.current?.(pendingIdBase, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: pendingIdBase.id,
        } as unknown as Stage);
      }
    });

    fireEvent.click(screen.getByTestId("base-confirm"));

    const realKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(realKey).toBe(PENDING_PROJECT_KEY);

    // Self-promote: installDraftAutosave(PENDING_PROJECT_KEY) re-runs (its own
    // synchronous save rewrites the SAME record), but `clearPersistenceDraft`
    // must never fire for this branch — the record is present, not removed.
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();
  });

  it("(c) start-over re-arms the pending autosave: new L1 progress after reset is persisted under the pending key again", async () => {
    localStorage.clear();
    vi.useFakeTimers();

    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    fireEvent.click(screen.getByTestId("identity-complete"));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    // Start over: arm + confirm the corner reset control (real component,
    // not mocked — visible on every survey step).
    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.click(screen.getByTestId("survey-reset-yes"));

    // handleStartOver's discardActiveDraft() removes the just-abandoned
    // pending record synchronously.
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBeNull();
    expect(screen.getByTestId("stage-identity")).toBeTruthy();

    // New L1 progress in this SAME mount, after the reset — only possible if
    // handleStartOver actually re-armed the pending-slot autosave
    // subscription (autosaveTeardownRef.current =
    // installDraftAutosave(DRAFT_PERSISTENCE_PENDING_KEY)); without that
    // re-arm this subscription would still be torn down from the reset and
    // this progress would go unpersisted until the NEXT base confirm.
    fireEvent.click(screen.getByTestId("identity-complete"));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    const stored = localStorage.getItem(draftKey(PENDING_PROJECT_KEY));
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored!) as DurableDraft).traversal.activeStepId).toBe("choose_base");
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

    await advanceToF();
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
// Back from Phase E (touch) returns to the touch_seed_source chooser
// (spec 035 R12 re-entry path) — NOT directly to mechanisms.
// ---------------------------------------------------------------------------

describe("SurveyView — Phase E back-navigation returns to touch_seed_source (R12)", () => {
  it("onBack passed to TouchGallery sets stage to touch_seed_source, not mechanisms", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Advance to the fork, confirm it, then reach Phase E (touch).
    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Click the back button in the Phase E mock.
    fireEvent.click(screen.getByTestId("e-back"));

    // Should resurface the seed-source chooser (R12), NOT mechanisms directly.
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });

  it("the chooser's own Back reaches mechanisms (the step genuinely visited immediately before touch_seed_source)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    fireEvent.click(screen.getByTestId("e-back"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // The chooser's own Back (not TouchGallery's) pops the walked-history —
    // which reaches "mechanisms" (the step genuinely visited immediately
    // before touch_seed_source now that sequences build inline there).
    fireEvent.click(screen.getByTestId("seed-source-back"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();
  });

  it("after returning to the fork from E, can re-confirm to reach E again", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Advance to Phase E.
    await advanceToTouchSeedSource();
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Go back — lands on the seed-source chooser (R12), not mechanisms.
    fireEvent.click(screen.getByTestId("e-back"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // Re-confirm — reaches Phase E again.
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();
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
// Adapt-track SC-002 walk — mirrors the copy-track carve->B back-navigation test
// ---------------------------------------------------------------------------
//
// SC-002 requires BOTH tracks walked through to carve, including back-from-carve
// landing on PhaseB. This test proves the adapt-track path (which skips
// project_name) converges on the same carve-back behavior as the copy-track path.

describe("SurveyView — adapt-track carve → B back-navigation (SC-002 parity)", () => {
  it("adapt-track: selects adapt → skips project_name → prefill-confirm → stage-B → phaseB-complete → carve → carve-back lands on stage-B (not prefill)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Drive to track stage, then select adapt (skips project_name).
    advanceToTrack();
    fireEvent.click(screen.getByTestId("track-adapt"));

    // Adapt-track lands directly on prefill (no project-name).
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();

    // Confirm prefill → PhaseB visible.
    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // Advance through PhaseB to carve (async landing — see advanceToCarve).
    fireEvent.click(screen.getByTestId("phaseB-complete"));
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();

    // carve-back must re-enter PhaseB (not prefill).
    fireEvent.click(screen.getByTestId("carve-back"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defect B regression — handlePhaseEComplete applies assignments to output
// ---------------------------------------------------------------------------
//
// handlePhaseEComplete must call setTouchLayoutJson with JSON derived from
// buildTouchLayoutJson(baseIr, assignments, opts) — NOT scaffoldTouchLayout(ir)
// with the assignments ignored. We seed baseIr into the store, emit a
// longpress assignment from the TouchGallery mock, and assert the stored
// touchLayoutJson contains the assignment data.
//
// Spec 035 R11 update: emission is no longer gated on "assignments non-empty"
// alone — the three rows below pin the matrix: import-adapt + a real edit
// emits; import-adapt + no edit + empty mods emits nothing; reseed-from-
// desktop ALWAYS emits, even with zero edits.

describe("SurveyView — handlePhaseEComplete applies assignments to output (Defect B)", () => {
  it("import-adapt + a real edit: setTouchLayoutJson is called with JSON containing the emitted assignment", async () => {
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

    // Navigate through the fork, then fire the TouchGallery complete button.
    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    // The touch_seed_source chooser is shown next (spec 035 R4/R12, no choice
    // recorded on a fresh walk) — NOT the real "touch" step, so
    // applyStepCompletion("touch") has not fired yet.
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-complete"));
    });
    // Confirming the fork lands on the real touch step and triggers
    // buildTouchLayoutJson on completion.
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

  it("baseIr null: setTouchLayoutJson(null) regardless of seedSource (the one gate the reducer still owns)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // baseIr is null — store is not seeded. handlePhaseEComplete must call
    // setTouchLayoutJson(null) rather than attempting to build a layout.
    _mockTouchEAssignmentsRef.current = [];

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    // Confirming touch_seed_source (spec 035 R4/R12 fork; no choice recorded
    // on a fresh walk) lands on the real "touch" step; completing it fires
    // applyStepCompletion("touch").
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-complete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // Store baseIr is null → touchLayoutJson must remain null.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("import-adapt + no edits + empty mods: setTouchLayoutJson(null) (truly-untouched no-op)", async () => {
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

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    // Confirming touch_seed_source (spec 035 R4/R12 fork; no choice recorded
    // on a fresh walk) lands on the real "touch" step; completing it fires
    // applyStepCompletion("touch").
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-complete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // No real edits → touchLayoutJson must be null so serializeWorkingCopy
    // leaves the VFS untouched and KMW uses its native default.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("reseed-from-desktop: setTouchLayoutJson is called (non-null) even with zero Phase E edits", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Zero Phase E edits — the row that would emit nothing under import-adapt.
    _mockTouchEAssignmentsRef.current = [];

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // Pick "Reseed from desktop" instead of the default import-adapt button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-reseed-complete"));
    });
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("e-complete"));
    });

    // R11: reseed-from-desktop ALWAYS emits (SC-002) — the mocked
    // buildTouchLayoutJson always returns non-null JSON, so a non-null stored
    // value here proves the emission gate let the build through.
    expect(useWorkingCopyStore.getState().touchLayoutJson).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T029 — manifest-driven invariants (M1, FR-009)
// ---------------------------------------------------------------------------
//
// These tests assert:
//   1. No SurveyStage union symbol exists in the runtime module.
//   2. The survey advances through steps in manifest order.
//   3. applyStepCompletion is called (side effects fire) for mechanisms/touch.

import { manifest } from "./steps/manifest.ts";
import * as StudioShellModule from "./StudioShell.tsx";

describe("T029 — no SurveyStage union in SurveyView module (M1, FR-009)", () => {
  it("StudioShell module does not export a SurveyStage symbol", () => {
    // SurveyStage was the retired union type. After T028 it must not exist as
    // a named export or as an identifiable runtime value.
    const exports = Object.keys(StudioShellModule);
    expect(exports).not.toContain("SurveyStage");
  });

  it("manifest spine order is: identity → choose_base → track → characters → marks → convenience → carve → mechanisms → touch → help → package (M2, spec 046)", () => {
    // track is now a real manifest step (P0 fix); project_name is spine:false.
    const spineIds = manifest
      .filter((s) => s.spine !== false)
      .map((s) => s.id);
    expect(spineIds).toEqual([
      "identity",
      "choose_base",
      "track",
      "characters",
      "marks",
      "convenience",
      "carve",
      "mechanisms",
      "touch",
      "help",
      "package",
    ]);
  });

  it("manifest project_name is spine:false with joinTarget 'characters' (M4b, P0 fix)", () => {
    const projName = manifest.find((s) => s.id === "project_name");
    expect(projName).toBeDefined();
    expect(projName?.spine).toBe(false);
    expect(projName?.joinTarget).toBe("characters");
  });

  it("manifest has exactly one lock:physical and one lock:touch, in that order (M3)", () => {
    const locks = manifest
      .filter((s) => s.lock !== undefined)
      .map((s) => ({ id: s.id, lock: s.lock }));
    expect(locks).toHaveLength(2);
    expect(locks[0]).toMatchObject({ lock: "physical" });
    expect(locks[1]).toMatchObject({ lock: "touch" });
  });

  it("manifest touch_seed_source is spine:false with joinTarget 'touch' (M4)", () => {
    const seedSource = manifest.find((s) => s.id === "touch_seed_source");
    expect(seedSource).toBeDefined();
    expect(seedSource?.spine).toBe(false);
    expect(seedSource?.joinTarget).toBe("touch");
  });

  it("all manifest step ids are unique (M5)", () => {
    const ids = manifest.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("T029 — runtime step order matches manifest spine order", () => {
  it("survey advances: identity → choose_base → track (manifest step) → project_name (copy, spine:false) → characters (prefill) → B → marks (S0 auto-skip) → carve → mechanisms → touch → help", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // identity (manifest step)
    expect(screen.getByTestId("stage-identity")).toBeTruthy();

    // → choose_base (manifest step: base picker only)
    fireEvent.click(screen.getByTestId("identity-complete"));
    expect(screen.getByTestId("stage-base")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();

    // → track (manifest step: copy vs adapt). Preview then confirm — two
    // separate clicks (preview-before-commit).
    fireEvent.click(screen.getByTestId("base-preview"));
    fireEvent.click(screen.getByTestId("base-confirm"));
    expect(screen.getByTestId("stage-track")).toBeTruthy();
    expect(screen.queryByTestId("stage-base")).toBeNull();

    // → project_name (manifest step: spine:false, copy-track CYOA fork)
    fireEvent.click(screen.getByTestId("track-copy"));
    expect(screen.getByTestId("stage-project-name")).toBeTruthy();
    expect(screen.queryByTestId("stage-track")).toBeNull();

    // → characters / prefill sub-stage (project_name joinTarget = "characters")
    fireEvent.click(screen.getByTestId("project-name-next"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    // → characters / B sub-stage (FR-012: characters before carve)
    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // → marks (next spine step after characters, spec 046) → carve. The
    // test alphabet has no marks, so the S0 gate auto-completes the marks
    // step without rendering and the walk lands directly on carve.
    fireEvent.click(screen.getByTestId("phaseB-complete"));
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();

    // → mechanisms
    fireEvent.click(screen.getByTestId("carve-complete"));
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // → touch_seed_source fork (stage-seed-source; spec 035 R4/R12, no choice recorded yet)
    fireEvent.click(screen.getByTestId("mechanisms-complete"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // touch_seed_source → touch (joinTarget hop; mocked TouchGallery stub, stage-E)
    fireEvent.click(screen.getByTestId("seed-source-complete"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // → help (stage-F)
    fireEvent.click(screen.getByTestId("e-complete"));
    expect(screen.getByTestId("stage-F")).toBeTruthy();
  });

  it("adapt-track skips project_name (spine:false) and lands directly on characters (P0 fix)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToTrack();
    expect(screen.getByTestId("stage-track")).toBeTruthy();

    // adapt-track: nextSpineStepAfter("track") skips project_name (spine:false).
    fireEvent.click(screen.getByTestId("track-adapt"));

    // Must land on prefill (characters step), not project-name.
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
  });

  it("characters step comes BEFORE carve in the manifest (FR-012)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // phaseB-complete must land on carve (via the marks step's S0 auto-skip
    // — the marks-free test alphabet completes marks without rendering).
    fireEvent.click(screen.getByTestId("phaseB-complete"));
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });

  it("applyStepCompletion fires lockDesktop when mechanisms completes (R1)", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await advanceToMechanisms();

    // lockDesktop should not have been called yet.
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);

    // Fire mechanisms-complete — applyStepCompletion('mechanisms', ...) must call lockDesktop().
    fireEvent.click(screen.getByTestId("mechanisms-complete"));

    // lockDesktop effect: desktopLocked becomes true.
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: rehydrating a corrupted persisted draft must not runaway-render
// (freeze report filed against commit b7c9a2c, "sanitize persisted step
// history so Back never resurfaces the Phase F gate").
//
// Placed LAST in this file deliberately: draftPersistence.wasDraftRestoredThisBoot()
// is a module-level flag that flips false -> true on the first successful
// loadDraft() and never resets (see draftPersistence.ts / draftPersistence.test.ts's
// own ordering note) — a successful loadDraft() here would otherwise make every
// SurveyView mount in a LATER test skip its own mount-time reset(), which is
// exactly the kind of ordering hazard draftPersistence.test.ts already
// documents. No test after this one depends on a fresh reset.
// ---------------------------------------------------------------------------

describe("rehydrate of a corrupted persisted draft does not runaway-render (freeze regression)", () => {
  it("loadDraft() + mounting SurveyView on a stale-help-in-history record notifies a bounded number of times and leaves history reference-stable", async () => {
    // Build a legitimately-walked position via real instantiate + advance(),
    // then corrupt `history` exactly the way an OLDER, pre-P0-fix build would
    // have persisted it: a stale "help" entry left behind while activeStepId
    // is anywhere other than "done" (see surveySessionStore.ts's
    // sanitizeHistory doc comment for the corruption class this repairs).
    const fakeIr = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: fakeIr,
    });
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("track");
    useSurveySessionStore.getState().advance("characters");
    useSurveySessionStore.getState().advance("marks");
    useSurveySessionStore.getState().advance("carve");
    useSurveySessionStore.setState({
      activeStepId: "mechanisms",
      history: [...useSurveySessionStore.getState().history, "help"],
    });

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    saveDraft(projectKey!);

    // Cold reset — simulate a fresh page boot with nothing live to inherit from.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    // Count every notification the survey-session store fires from the start
    // of rehydrate onward. A runaway render/setState loop shows up here as an
    // unbounded (or very large) count within this synchronous test; a correct,
    // idempotent rehydrate + mount fires only a handful of times.
    let notifyCount = 0;
    const unsubscribe = useSurveySessionStore.subscribe(() => {
      notifyCount += 1;
    });

    expect(loadDraft(projectKey!)).toBe(true);
    // Sanitized immediately at rehydrate — "help" never resurfaces live.
    expect(useSurveySessionStore.getState().history).not.toContain("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");

    const historyAfterLoad = useSurveySessionStore.getState().history;

    // Mount the real component tree on top of the rehydrated state, exactly
    // as main.tsx -> StudioShell would on a real boot. If rehydrate (or any
    // effect it triggers) forms a render -> setState -> render cycle, this
    // either hangs (test times out) or notifyCount grows unboundedly.
    await act(async () => {
      render(<SurveyView baseKeyboard={basicKbdus} />);
    });

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // Idempotence / reference-stability invariant: having already been
    // sanitized once, the live history must not have been reallocated again
    // by mount, and total store churn must stay small and bounded.
    expect(useSurveySessionStore.getState().history).toBe(historyAfterLoad);
    expect(notifyCount).toBeLessThan(10);

    unsubscribe();
  });

  it("resuming directly AT the real (unmocked) PhaseFGate after rehydrate does not runaway-render", async () => {
    // Second real-code-path scenario: unlike the "mechanisms" case above
    // (where PhaseFGate never mounts), this resumes with activeStepId ===
    // "help" itself, so the actual PhaseFGate wrapper (ConfirmDialog +
    // backToUnfinishedGallery wiring) is on-screen and exercised, not just
    // the mocked step body inside it.
    const fakeIr = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: fakeIr,
    });
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("track");
    useSurveySessionStore.getState().advance("characters");
    useSurveySessionStore.getState().advance("marks");
    useSurveySessionStore.getState().advance("carve");
    useSurveySessionStore.getState().advance("mechanisms");
    useSurveySessionStore.setState({ activeStepId: "help" });

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    saveDraft(projectKey!);

    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    let notifyCount = 0;
    const unsubscribe = useSurveySessionStore.subscribe(() => {
      notifyCount += 1;
    });

    expect(loadDraft(projectKey!)).toBe(true);
    expect(useSurveySessionStore.getState().activeStepId).toBe("help");

    await act(async () => {
      render(<SurveyView baseKeyboard={basicKbdus} />);
    });

    // PhaseFGate's wrapped step body renders (empty confirmedInventory means
    // the coverage gate is unblocked, so the ConfirmDialog stays closed and
    // "stage-F" is what's visible).
    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(notifyCount).toBeLessThan(10);

    unsubscribe();
  });
});
