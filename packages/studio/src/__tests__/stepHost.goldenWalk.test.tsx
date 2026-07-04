// Golden-walk parity oracle — spec 028 Stage 5, T002–T004.
//
// SEAM CHOICE: This harness renders SurveyView with the same shallow mock
// pattern used in StudioShell.test.tsx (all child survey/gallery/hook modules
// mocked), then spies on FOUR module-level boundaries:
//
//   1. `applyStepCompletion` from `steps/reducer.ts` — spy via vi.spyOn after
//      import.  Records which step IDs flow through the reducer.
//   2. `surveySessionStore` mutators (advance, popHistory, setIdentityResult,
//      setSurveyContext, setSelectedTrack, setScaffoldSpec, setLocalBase,
//      setCharactersSubStage) — injected via useSurveySessionStore.setState so
//      the spy still executes the real logic.  Records call order.
//   3. `workingCopyStore` mutators (recordPhase, setIdentity, lockDesktop,
//      setTouchLayoutJson) — injected via useWorkingCopyStore.setState in the
//      same way.  Captures the host-level working-copy writes that the Stage 5
//      refactor centralises into StepHost (research R7, contract §2).
//   4. `navigateTo` from `lib/navigate.ts` — a vi.mock fn; captures top-level
//      route transitions.
//
// CAPTURE POLICY — DIRECT vs IMPLIED-BY-REDUCER:
//   - `recordPhase` and `setIdentity` are called DIRECTLY by SurveyView handlers
//     (handleIdentityComplete, handleProjectNameNext, handlePhaseFComplete,
//     characters onComplete).  These are the calls the Stage 5 refactor will move
//     into the centralized StepHost completion path (R7).  Captured DIRECTLY in
//     `workingCopyMutations`.
//   - `lockDesktop` and `setTouchLayoutJson` fire INSIDE `applyStepCompletion`
//     via the injected `reducerDeps` closures (R1/R2 in reducer.ts).  They are
//     therefore IMPLIED by the `applyStepCompletion` entry for "mechanisms" /
//     "touch" respectively.  We capture them directly as well (the spy patches
//     the same reducerDeps-injected closures via useWorkingCopyStore.setState),
//     but their presence here is redundant with the reducer entry — it is belt-
//     and-suspenders coverage.
//   - `routeAnswersThroughMutate` is a private (non-exported) function in
//     StudioShell.tsx.  A direct spy is impractical without production-code
//     changes.  Its effect (routing in-scope question answers through question-
//     module `mutate()` helpers) is delegated to reducerDeps closures and is
//     therefore INDIRECTLY covered by the `applyStepCompletion` entries for the
//     steps that call it (identity, characters/B, help).  The refactor must
//     preserve its call site by code inspection, not by this oracle.
//
// WHY THIS SEAM IS REFACTOR-STABLE:
//   - No SurveyView internal function names appear in the fixture shape.
//   - The captured sequence is purely behavioural: which named effects fire, in
//     which order, for each step event.
//   - After the StepHost refactor the same effects must flow through the same
//     boundaries in the same order.  A zero-diff replay = parity pass (SC-001).
//
// WHY WE RENDER SURVEYVIEW (not drive the store directly):
//   - The handler wiring ORDER (e.g. setIdentityResult before setSurveyContext
//     before advance, or recordPhase before applyStepCompletion before advance)
//     is what the oracle locks.  Reconstructing that order outside the real
//     handlers would silently duplicate them — defeating the oracle's purpose.
//
// DETERMINISM GUARANTEE:
//   - All child components are deterministic stubs emitting fixed fake data.
//   - All spied calls are synchronous.  No timestamps or random ids appear.
//   - Store mutation ORDER is deterministic: synchronous Zustand setState calls
//     within a single handler execute in their source-code order.
//
// FIXTURE FORMAT (one entry per step-completion event, in walk order):
//   Array<{
//     stepId: string;                    // step whose completion handler fired
//     applyStepCompletion: string[];     // applyStepCompletion arg[0] values
//     storeMutations: string[];          // session-store mutator names (call order)
//     workingCopyMutations: string[];    // working-copy mutator names (call order)
//     navigateTo: string[];             // navigateTo arg[0] values
//   }>
//
// This test must remain UNMODIFIED through Phase 3-5 of spec 028.
// DO NOT modify production code from this file.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

// ---------------------------------------------------------------------------
// vi.hoisted — refs for mock component callbacks (must precede vi.mock)
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
  const mockIdentityCompleteRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockBaseResolvedRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockCarveDoneRef = { current: null as null | (() => void) };
  const mockCarveBackRef = { current: null as null | (() => void) };
  const mockPhaseBDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseBBackRef = { current: null as null | (() => void) };
  const mockMechDoneRef = { current: null as null | (() => void) };
  const mockMechBackRef = { current: null as null | (() => void) };
  const mockPhaseFDoneRef = { current: null as null | ((...args: unknown[]) => void) };
  const mockPhaseFBackRef = { current: null as null | (() => void) };
  const mockTouchECompleteRef = { current: null as null | ((a: unknown[]) => void) };
  const mockTouchEAssignmentsRef = { current: [] as unknown[] };
  const mockTouchEBackRef = { current: null as null | (() => void) };
  return {
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
  };
});

// Aliases for use in mock factories (vi.hoisted refs not in scope there).
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
// Fake data emitted by mock survey components
// ---------------------------------------------------------------------------

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
const fakeBase = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"],
  version: "1.0",
};

// ---------------------------------------------------------------------------
// Mock child survey components — identical stubs to StudioShell.test.tsx
// ---------------------------------------------------------------------------

vi.mock("../survey/index.ts", () => ({
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
  Prefill: ({ onConfirm, onBack }: { onConfirm: () => void; onBack?: () => void }) => (
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
  ),
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
  PhaseTrack: ({
    onTrackSelected,
    onBack,
  }: {
    onTrackSelected: (t: "copy" | "adapt") => void;
    onBack?: () => void;
  }) => (
    <div data-testid="stage-track">
      <button type="button" data-testid="track-copy" onClick={() => onTrackSelected("copy")}>
        track-copy
      </button>
      <button type="button" data-testid="track-adapt" onClick={() => onTrackSelected("adapt")}>
        track-adapt
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="track-back" onClick={onBack}>
          track-back
        </button>
      )}
    </div>
  ),
  PhaseProjectName: ({
    onProjectNameNext,
    onBack,
  }: {
    onProjectNameNext: (displayName: string, keyboardId: string) => void;
    onBack?: () => void;
  }) => (
    <div data-testid="stage-project-name">
      <button
        type="button"
        data-testid="project-name-next"
        onClick={() => onProjectNameNext("Test Keyboard", "test_keyboard")}
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
  PhaseA: () => <div data-testid="stage-A" />,
  SurveyRunner: () => <div data-testid="survey-runner" />,
  extractIdentityLite: (r: unknown) => r,
  extractIdentity: () => ({}),
  extractProvenance: () => ({}),
  buildPrefillRows: () => [],
}));

vi.mock("../editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: ({ onResolved, onBack }: { onResolved: (base: unknown) => void; onBack?: () => void }) => {
    _mockBaseResolvedRef.current = onResolved;
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

vi.mock("../editors/carve/CarveGallery.tsx", () => ({
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

vi.mock("../editors/assignLoop/MechanismGallery.tsx", () => ({
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

vi.mock("../editors/assignLoop/TouchGallery.tsx", () => ({
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
        <button type="button" data-testid="e-back" onClick={onBack}>
          Back
        </button>
      </div>
    );
  },
}));

vi.mock("../components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: ({ script }: { script: string }) => (
    <div data-testid="stage-unsupported">{script}</div>
  ),
}));

vi.mock("../components/OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame" />,
}));

vi.mock("../components/OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-toggle" />,
}));

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));

vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

vi.mock("../lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
}));

vi.mock("../lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: (
    _baseIr: unknown,
    assignments: Array<{ target: string; mechanisms: Array<{ patternId: string; slotValues?: Record<string, string> }> }>,
  ) => ({
    json: JSON.stringify({ _mock: true, assignments }),
    warnings: [],
  }),
}));

vi.mock("../components/PreviewScreen.tsx", () => ({
  PreviewScreen: () => <div data-testid="preview-screen-root">preview-screen</div>,
}));

vi.mock("../components/OutputScreen.tsx", () => ({
  OutputScreen: () => <div data-testid="output-screen-root">output-screen</div>,
}));

vi.mock("../dashboard/DashboardView.tsx", () => ({
  FlowMapView: () => <div data-testid="flow-map-view">flow-map</div>,
}));

vi.mock("../lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock declarations)
// ---------------------------------------------------------------------------

import { SurveyView } from "../StudioShell.tsx";
import { navigateTo } from "../lib/navigate.ts";
import * as ReducerModule from "../steps/reducer.ts";

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface WalkEntry {
  stepId: string;
  applyStepCompletion: string[];
  /** Session-store mutator names in call order. */
  storeMutations: string[];
  /**
   * Working-copy store mutator names in call order.
   *
   * Directly captured: recordPhase, setIdentity (= setStoreIdentity in
   * SurveyView), lockDesktop, setTouchLayoutJson.
   *
   * lockDesktop fires INSIDE applyStepCompletion("mechanisms") via reducerDeps;
   * setTouchLayoutJson fires INSIDE applyStepCompletion("touch") via reducerDeps.
   * Both are also IMPLIED by the applyStepCompletion entry for their step — the
   * direct capture here is belt-and-suspenders.  recordPhase and setIdentity are
   * called DIRECTLY by SurveyView handlers BEFORE applyStepCompletion and are the
   * primary reason this field exists (the Stage 5 refactor moves them into the
   * centralised StepHost completion path per research R7).
   */
  workingCopyMutations: string[];
  navigateTo: string[];
}

// ---------------------------------------------------------------------------
// Session-store mutator names to spy on
// ---------------------------------------------------------------------------

const SESSION_MUTATOR_NAMES = [
  "advance",
  "popHistory",
  "setIdentityResult",
  "setSurveyContext",
  "setSelectedTrack",
  "setScaffoldSpec",
  "setLocalBase",
  "setCharactersSubStage",
] as const;

// ---------------------------------------------------------------------------
// Working-copy store mutator names to spy on
//
// Captures the host-level calls that Stage 5 centralises (R7):
//   - recordPhase: called directly by handlers for identity, characters, and help.
//   - setIdentity: called directly by handleProjectNameNext (copy-track only).
//   - lockDesktop: called inside applyStepCompletion("mechanisms") via reducerDeps.
//   - setTouchLayoutJson: called inside applyStepCompletion("touch") via reducerDeps.
// ---------------------------------------------------------------------------

const WC_MUTATOR_NAMES = [
  "recordPhase",
  "setIdentity",
  "lockDesktop",
  "setTouchLayoutJson",
] as const;

// ---------------------------------------------------------------------------
// Recorder factory
// ---------------------------------------------------------------------------

/**
 * Attach spies to all tracked mutators and the reducer, returning a per-step
 * recorder.  Call beginStep(id) before triggering the user action and endStep()
 * immediately after to close the entry.
 */
function createRecorder() {
  const walk: WalkEntry[] = [];
  let current: WalkEntry | null = null;

  // 1. Spy on applyStepCompletion (exported; vi.spyOn wraps the live export).
  const applyStepCompletionSpy = vi.spyOn(ReducerModule, "applyStepCompletion");

  // 2. navigateTo mock fn.
  const navigateToMock = navigateTo as ReturnType<typeof vi.fn>;

  // 3. Session-store mutator spies — injected via setState so real logic still runs.
  const sessionSpies: Record<string, ReturnType<typeof vi.fn>> = {};
  {
    const store = useSurveySessionStore.getState();
    for (const name of SESSION_MUTATOR_NAMES) {
      const original = store[name] as (...args: unknown[]) => void;
      const spy = vi.fn((...args: unknown[]) => original(...args));
      useSurveySessionStore.setState({ [name]: spy } as Partial<typeof store>);
      sessionSpies[name] = spy;
    }
  }

  // 4. Working-copy store mutator spies — same pattern.
  const wcSpies: Record<string, ReturnType<typeof vi.fn>> = {};
  {
    const store = useWorkingCopyStore.getState();
    for (const name of WC_MUTATOR_NAMES) {
      const original = store[name] as (...args: unknown[]) => void;
      const spy = vi.fn((...args: unknown[]) => original(...args));
      useWorkingCopyStore.setState({ [name]: spy } as Partial<typeof store>);
      wcSpies[name] = spy;
    }
  }

  /** Clear all spy call records before each step window. */
  function clearAll() {
    applyStepCompletionSpy.mockClear();
    navigateToMock.mockClear();
    for (const spy of Object.values(sessionSpies)) spy.mockClear();
    for (const spy of Object.values(wcSpies)) spy.mockClear();
  }

  function beginStep(stepId: string) {
    clearAll();
    current = {
      stepId,
      applyStepCompletion: [],
      storeMutations: [],
      workingCopyMutations: [],
      navigateTo: [],
    };
  }

  /**
   * Collect all spy calls across two name lists and sort them by Vitest's global
   * invocation-call-order counter so the interleaved ordering is deterministic.
   */
  function collectOrdered(
    spies: Record<string, ReturnType<typeof vi.fn>>,
    nameList: readonly string[],
  ): string[] {
    const ordered: Array<{ name: string; idx: number }> = [];
    for (const name of nameList) {
      const spy = spies[name];
      if (!spy) continue;
      for (let i = 0; i < spy.mock.calls.length; i++) {
        ordered.push({ name, idx: spy.mock.invocationCallOrder[i] ?? i });
      }
    }
    ordered.sort((a, b) => a.idx - b.idx);
    return ordered.map((o) => o.name);
  }

  function endStep() {
    if (!current) return;

    for (const call of applyStepCompletionSpy.mock.calls) {
      current.applyStepCompletion.push(String(call[0]));
    }

    current.storeMutations = collectOrdered(sessionSpies, SESSION_MUTATOR_NAMES);
    current.workingCopyMutations = collectOrdered(wcSpies, WC_MUTATOR_NAMES);

    for (const call of navigateToMock.mock.calls) {
      current.navigateTo.push(String(call[0]));
    }

    walk.push(current);
    current = null;
  }

  function getWalk(): WalkEntry[] {
    return walk;
  }

  function restore() {
    applyStepCompletionSpy.mockRestore();
    // Store spies are cleaned up by the afterEach store.reset() calls.
  }

  return { beginStep, endStep, getWalk, restore };
}

// ---------------------------------------------------------------------------
// Walk drivers
// ---------------------------------------------------------------------------

/**
 * Drive the full copy-track walk.
 * identity -> choose_base -> track(copy) -> project_name ->
 * characters(prefill->B) -> carve -> mechanisms -> touch -> help -> done
 */
async function driveCopyTrack(recorder: ReturnType<typeof createRecorder>): Promise<void> {
  recorder.beginStep("identity");
  fireEvent.click(screen.getByTestId("identity-complete"));
  recorder.endStep();

  recorder.beginStep("choose_base");
  fireEvent.click(screen.getByTestId("base-resolved"));
  recorder.endStep();

  recorder.beginStep("track");
  fireEvent.click(screen.getByTestId("track-copy"));
  recorder.endStep();

  recorder.beginStep("project_name");
  fireEvent.click(screen.getByTestId("project-name-next"));
  recorder.endStep();

  recorder.beginStep("characters/prefill");
  fireEvent.click(screen.getByTestId("prefill-confirm"));
  recorder.endStep();

  recorder.beginStep("characters/B");
  fireEvent.click(screen.getByTestId("phaseB-complete"));
  recorder.endStep();

  recorder.beginStep("carve");
  fireEvent.click(screen.getByTestId("carve-complete"));
  recorder.endStep();

  recorder.beginStep("mechanisms");
  fireEvent.click(screen.getByTestId("mechanisms-complete"));
  recorder.endStep();

  recorder.beginStep("touch");
  await act(async () => {
    fireEvent.click(screen.getByTestId("e-complete"));
  });
  recorder.endStep();

  recorder.beginStep("help");
  await act(async () => {
    fireEvent.click(screen.getByTestId("phaseF-complete"));
  });
  recorder.endStep();
}

/**
 * Drive the full adapt-track walk.
 * identity -> choose_base -> track(adapt) ->
 * characters(prefill->B) -> carve -> mechanisms -> touch -> help -> done
 * project_name MUST NOT appear.
 */
async function driveAdaptTrack(recorder: ReturnType<typeof createRecorder>): Promise<void> {
  recorder.beginStep("identity");
  fireEvent.click(screen.getByTestId("identity-complete"));
  recorder.endStep();

  recorder.beginStep("choose_base");
  fireEvent.click(screen.getByTestId("base-resolved"));
  recorder.endStep();

  recorder.beginStep("track");
  fireEvent.click(screen.getByTestId("track-adapt"));
  recorder.endStep();

  recorder.beginStep("characters/prefill");
  fireEvent.click(screen.getByTestId("prefill-confirm"));
  recorder.endStep();

  recorder.beginStep("characters/B");
  fireEvent.click(screen.getByTestId("phaseB-complete"));
  recorder.endStep();

  recorder.beginStep("carve");
  fireEvent.click(screen.getByTestId("carve-complete"));
  recorder.endStep();

  recorder.beginStep("mechanisms");
  fireEvent.click(screen.getByTestId("mechanisms-complete"));
  recorder.endStep();

  recorder.beginStep("touch");
  await act(async () => {
    fireEvent.click(screen.getByTestId("e-complete"));
  });
  recorder.endStep();

  recorder.beginStep("help");
  await act(async () => {
    fireEvent.click(screen.getByTestId("phaseF-complete"));
  });
  recorder.endStep();
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixture helpers — write on first run, compare on subsequent runs
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, "__fixtures__", "goldenWalk");

function loadOrWriteFixture(name: string, walk: WalkEntry[]): WalkEntry[] {
  const path = join(FIXTURE_DIR, `${name}.json`);
  if (!existsSync(path)) {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(walk, null, 2) + "\n", "utf8");
    return walk;
  }
  return JSON.parse(readFileSync(path, "utf8")) as WalkEntry[];
}

// ---------------------------------------------------------------------------
// T003 — copy-track golden walk
// ---------------------------------------------------------------------------

describe("golden-walk: copy-track (T003)", () => {
  let recorder: ReturnType<typeof createRecorder>;

  beforeEach(() => {
    recorder = createRecorder();
  });

  afterEach(() => {
    recorder.restore();
  });

  it("records the copy-track traversal and matches the committed fixture", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const walk = recorder.getWalk();
    const fixture = loadOrWriteFixture("copy", walk);

    expect(walk).toEqual(fixture);
  });

  it("copy-track walk contains project_name step", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const stepIds = recorder.getWalk().map((e) => e.stepId);
    expect(stepIds).toContain("project_name");
  });

  it("copy-track project_name entry carries setIdentity in workingCopyMutations", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const projEntry = recorder.getWalk().find((e) => e.stepId === "project_name");
    expect(projEntry).toBeDefined();
    expect(projEntry!.workingCopyMutations).toContain("setIdentity");
  });

  it("copy-track identity entry carries recordPhase in workingCopyMutations", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const idEntry = recorder.getWalk().find((e) => e.stepId === "identity");
    expect(idEntry).toBeDefined();
    expect(idEntry!.workingCopyMutations).toContain("recordPhase");
  });

  it("copy-track help entry carries recordPhase in workingCopyMutations and navigateTo output", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const helpEntry = recorder.getWalk().find((e) => e.stepId === "help");
    expect(helpEntry).toBeDefined();
    expect(helpEntry!.workingCopyMutations).toContain("recordPhase");
    expect(helpEntry!.navigateTo).toContain("output");
  });

  it("copy-track mechanisms entry carries lockDesktop in workingCopyMutations", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveCopyTrack(recorder);

    const mechEntry = recorder.getWalk().find((e) => e.stepId === "mechanisms");
    expect(mechEntry).toBeDefined();
    expect(mechEntry!.workingCopyMutations).toContain("lockDesktop");
  });
});

// ---------------------------------------------------------------------------
// T004 — adapt-track golden walk
// ---------------------------------------------------------------------------

describe("golden-walk: adapt-track (T004)", () => {
  let recorder: ReturnType<typeof createRecorder>;

  beforeEach(() => {
    recorder = createRecorder();
  });

  afterEach(() => {
    recorder.restore();
  });

  it("records the adapt-track traversal and matches the committed fixture", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const walk = recorder.getWalk();
    const fixture = loadOrWriteFixture("adapt", walk);

    expect(walk).toEqual(fixture);
  });

  it("adapt-track walk does NOT contain project_name step", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const stepIds = recorder.getWalk().map((e) => e.stepId);
    expect(stepIds).not.toContain("project_name");
  });

  it("adapt-track walk has no setIdentity in any workingCopyMutations entry", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const allWcMutations = recorder.getWalk().flatMap((e) => e.workingCopyMutations);
    expect(allWcMutations).not.toContain("setIdentity");
  });

  it("adapt-track identity entry carries recordPhase in workingCopyMutations", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const idEntry = recorder.getWalk().find((e) => e.stepId === "identity");
    expect(idEntry).toBeDefined();
    expect(idEntry!.workingCopyMutations).toContain("recordPhase");
  });

  it("adapt-track help entry carries recordPhase and navigateTo output", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const helpEntry = recorder.getWalk().find((e) => e.stepId === "help");
    expect(helpEntry).toBeDefined();
    expect(helpEntry!.workingCopyMutations).toContain("recordPhase");
    expect(helpEntry!.navigateTo).toContain("output");
  });

  it("adapt-track mechanisms entry carries lockDesktop in workingCopyMutations", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    await driveAdaptTrack(recorder);

    const mechEntry = recorder.getWalk().find((e) => e.stepId === "mechanisms");
    expect(mechEntry).toBeDefined();
    expect(mechEntry!.workingCopyMutations).toContain("lockDesktop");
  });
});
