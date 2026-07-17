// Integration coverage for the preview-before-commit capture-ref + commit
// gating added to SurveyView (StudioShell.tsx): `onInstantiate` only CAPTURES
// the compile pipeline's settled artifact into `pendingArtifactRef`; the real
// instantiation (`doCommit` -> applyStepCompletion("choose_base") ->
// instantiateFromBaseIfConfirmed) fires ONLY once BOTH:
//   - the author has confirmed (surveySessionStore.baseConfirmed === true), AND
//   - the compile pipeline has settled for THAT SAME base
// are true (either order).
//
// Approach (precedent: usePreviewArtifact.reinstantiate.test.ts): mock
// useKeyboardArtifact to CAPTURE the onInstantiate callback SurveyView passes
// it (rather than driving the real WASM compile pipeline) and to expose a
// controllable `stage` so a test can simulate the pipeline transitioning to
// "ready" independently of when the author clicks confirm. BaseResolution is
// mocked with two fixed preview buttons (base A / base B) + one confirm
// button, mirroring the real BaseResolutionAdapter wiring under test (which
// is NOT mocked — it is the code under test here, along with SurveyView's
// capture-ref effect).
//
// Follow-up fix on PR #1174: the REAL BaseResolution now disables its
// "Choose this keyboard" button unless previewStatus === "ready" (see
// editors/panels/BaseResolution.tsx), which makes "confirm while the compile
// is still pending/errored" unreachable through the actual UI. The mocked
// BaseResolution below intentionally does NOT reproduce that gating — its fixed
// `commit` button is disabled only on `previewedBase === null` — because the
// scenarios that exercise it are testing SurveyView's own effect-level
// defensive guarantees (the single-instantiation effect gated on
// `baseConfirmed`/`artifactStage`), which exist independently of whatever UI
// sits in front of them and must hold even if a future caller reaches this
// effect through a different, less-gated component.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState, useEffect } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { basicKbdus, silEuroLatin, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { OnInstantiateCallback, Stage } from "./hooks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// vi.hoisted — shared mutable state for the controllable useKeyboardArtifact
// mock. Must precede vi.mock() calls.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  onInstantiateRef: { current: null as OnInstantiateCallback | null },
  // Every mounted useKeyboardArtifact call registers its setState here so the
  // test can push a new stage into the LIVE hook instance (forcing SurveyView
  // to re-render with the new artifactStage, exactly as a real pipeline
  // transition would).
  stageSetters: [] as Array<(s: Stage) => void>,
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("./hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _base: unknown,
    _spec: unknown,
    _transform: unknown,
    onInstantiate: OnInstantiateCallback | null | undefined,
  ) => {
    hoisted.onInstantiateRef.current = onInstantiate ?? null;
    const [stage, setStage_] = useState<Stage>({ kind: "idle" });
    useEffect(() => {
      hoisted.stageSetters.push(setStage_);
      return () => {
        hoisted.stageSetters = hoisted.stageSetters.filter((f) => f !== setStage_);
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
}));

vi.mock("./lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("./components/OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame" />,
}));

vi.mock("./components/OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-toggle" />,
}));

// BaseResolution mock — two fixed preview buttons (base A / base B) + one
// confirm button. Exercises the REAL BaseResolutionAdapter (not mocked)
// underneath, which is what wires setLocalBase/setBaseConfirmed per the
// preview-before-commit contract.
const BASE_A: BaseKeyboard = basicKbdus;
const BASE_B: BaseKeyboard = silEuroLatin;

vi.mock("./editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: ({
    onPreview,
    onConfirm,
    previewedBase,
  }: {
    onPreview: (base: BaseKeyboard) => void;
    onConfirm: () => void;
    previewedBase: BaseKeyboard | null;
    previewStatus: string;
  }) => (
    <div data-testid="stage-base">
      <button type="button" data-testid="preview-a" onClick={() => onPreview(BASE_A)}>
        preview-a
      </button>
      <button type="button" data-testid="preview-b" onClick={() => onPreview(BASE_B)}>
        preview-b
      </button>
      <button
        type="button"
        data-testid="commit"
        disabled={previewedBase === null}
        onClick={onConfirm}
      >
        commit
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Imports AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { SurveyView } from "./StudioShell.tsx";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";

const instantiateSpy = instantiateFromBaseIfConfirmed as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A settled compile artifact payload, shaped like OnInstantiateCallback's opts. */
function artifactFor(_base: BaseKeyboard) {
  return {
    vfs: createVirtualFS([]),
    ir: makeTestIR([]),
    removalCapabilities: new Map(),
  };
}

/** A minimal "ready" Stage for `base` — only `.kind` is read by the code under test. */
function readyStageFor(base: BaseKeyboard): Stage {
  return {
    kind: "ready",
    compileResult: {},
    jsBlobUrl: "blob:test",
    vfs: createVirtualFS([]),
    scaffoldWarnings: [],
    keyboardId: base.id,
  } as unknown as Stage;
}

/**
 * Simulate the compile pipeline settling for `base`: fires the captured
 * onInstantiate callback THEN transitions the mocked hook's stage to "ready"
 * — same order as the real hook (see useKeyboardArtifact.ts run(), which
 * calls onInstantiate before setStage(readyStage)). Both happen inside one
 * act() so SurveyView's single-instantiation effect (deps: [baseConfirmed,
 * artifactStage]) sees both the filled pendingArtifactRef AND the new stage
 * reference in the same re-render, exactly as production does.
 */
function settleFor(base: BaseKeyboard) {
  act(() => {
    hoisted.onInstantiateRef.current?.(base, artifactFor(base));
    for (const set of hoisted.stageSetters) set(readyStageFor(base));
  });
}

async function renderAtChooseBase() {
  await act(async () => {
    render(<SurveyView baseKeyboard={null} />);
  });
  // Skip identity — jump straight to the choose_base step under test.
  act(() => {
    useSurveySessionStore.getState().advance("choose_base");
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  hoisted.onInstantiateRef.current = null;
  hoisted.stageSetters = [];
});

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SurveyView — preview-before-commit capture-ref + commit gating", () => {
  it("previewing several bases never instantiates or installs autosave until commit", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-a"));
    settleFor(BASE_A);
    fireEvent.click(screen.getByTestId("preview-b"));
    settleFor(BASE_B);

    // Multiple previews, no commit click at all.
    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(false);
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
  });

  it("preview A then B, then commit while B's compile is already settled -> instantiates exactly once, with base B", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-a"));
    settleFor(BASE_A);
    fireEvent.click(screen.getByTestId("preview-b"));
    settleFor(BASE_B);

    fireEvent.click(screen.getByTestId("commit"));

    expect(instantiateSpy).toHaveBeenCalledTimes(1);
    expect(instantiateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: BASE_B.id }),
      expect.anything(),
    );
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(true);
  });

  // NOTE (PR #1174 follow-up): via the REAL UI this scenario is now
  // unreachable — BaseResolution disables "Choose this keyboard" until
  // previewStatus === "ready", so a click can no longer land while the
  // compile is still pending. The mocked commit button here does not
  // reproduce that gating (see the file-header note above), so this test now
  // documents a DEFENSIVE EFFECT-LEVEL guarantee rather than a user-reachable
  // flow: if `baseConfirmed` is ever set before `pendingArtifactRef` is
  // filled for the current base (e.g. a future caller with looser gating),
  // the single-instantiation effect must still defer, not misfire, and must
  // complete exactly once the pipeline later settles for that same base.
  it("[effect-level defensive guarantee] baseConfirmed set before the pipeline settles defers doCommit; completes once it settles for that same base", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-b"));
    // No settleFor() yet — the compile is still "in flight" for base B.

    fireEvent.click(screen.getByTestId("commit"));
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(true);
    expect(instantiateSpy).not.toHaveBeenCalled();

    // The pipeline settles for base B AFTER the commit click — the
    // single-instantiation effect must re-run (artifactStage dependency) and
    // complete the deferred commit exactly once, without a second click.
    settleFor(BASE_B);

    expect(instantiateSpy).toHaveBeenCalledTimes(1);
    expect(instantiateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: BASE_B.id }),
      expect.anything(),
    );
  });

  // Error-path sibling of the guarantee above (PR #1174 follow-up, km-qc
  // finding #2): if the previewed base's compile ERRORS rather than settling
  // ready, `onInstantiate` never fires for it (see useKeyboardArtifact.ts —
  // the callback only runs on the success path), so `pendingArtifactRef`
  // never fills for that base. Even if `baseConfirmed` is set regardless
  // (again: unreachable via the real gated button, but a defensive guarantee
  // the effect itself must uphold), the single-instantiation effect must
  // NEVER run doCommit for an errored base — no instantiation, no autosave
  // install, no advance onto a broken working copy.
  it("[effect-level defensive guarantee] baseConfirmed set while the previewed base's compile has ERRORED never instantiates", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-b"));
    // The compile pipeline errors for base B — onInstantiate is never called,
    // so pendingArtifactRef stays null for this base.
    act(() => {
      for (const set of hoisted.stageSetters) {
        set({ kind: "error", step: "compile", message: "compile failed" });
      }
    });

    fireEvent.click(screen.getByTestId("commit"));
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(true);
    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();

    // The error stage is re-asserted (simulating a re-render/retry that still
    // errors) — the effect re-runs on the artifactStage dependency but must
    // still never instantiate, since pendingArtifactRef was never filled.
    act(() => {
      for (const set of hoisted.stageSetters) {
        set({ kind: "error", step: "compile", message: "compile failed again" });
      }
    });
    expect(instantiateSpy).not.toHaveBeenCalled();
  });

  // Precise failure-sibling requested by km-triage (PR #1174, finding #1 — the
  // "pending-while-confirmed -> error-after-commit" case): confirm while the
  // compile is still PENDING (in-flight, no stage transition yet), THEN the
  // pipeline settles into ERROR for that same base. `onInstantiate` never fires
  // on the error path (useKeyboardArtifact.ts), so `pendingArtifactRef` never
  // fills; the deferred commit must NEVER complete — no instantiation, no
  // advance onto a broken working copy — even though the error stage landing
  // re-runs the single-instantiation effect via its `artifactStage` dep. (In
  // the real UI this is unreachable — the button is gated on
  // previewStatus === "ready" — so this documents the effect's own defensive
  // guarantee; see the file-header note.)
  it("[effect-level defensive guarantee] baseConfirmed set while pending, then the compile ERRORS -> never instantiates", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-b"));
    // Confirm while B's compile is still in flight — no settleFor() yet.
    fireEvent.click(screen.getByTestId("commit"));
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(true);
    expect(instantiateSpy).not.toHaveBeenCalled();

    // The pipeline then settles into ERROR (not ready) for base B AFTER the
    // confirm — onInstantiate is never called, so pendingArtifactRef stays
    // null. The effect re-runs on the artifactStage change but must not fire.
    act(() => {
      for (const set of hoisted.stageSetters) {
        set({ kind: "error", step: "compile", message: "compile failed after confirm" });
      }
    });

    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
  });

  it("preview without ever confirming never instantiates, regardless of how many settled artifacts arrive", async () => {
    await renderAtChooseBase();

    fireEvent.click(screen.getByTestId("preview-a"));
    settleFor(BASE_A);
    fireEvent.click(screen.getByTestId("preview-b"));
    settleFor(BASE_B);
    fireEvent.click(screen.getByTestId("preview-a"));
    settleFor(BASE_A);

    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(false);
  });

  it("a stale settled artifact from a PREVIOUS preview does not leak into a commit for the CURRENT preview", async () => {
    await renderAtChooseBase();

    // Preview A, let it settle.
    fireEvent.click(screen.getByTestId("preview-a"));
    settleFor(BASE_A);

    // Re-preview to B WITHOUT letting B settle yet, then commit immediately.
    fireEvent.click(screen.getByTestId("preview-b"));
    fireEvent.click(screen.getByTestId("commit"));

    // pendingArtifactRef still holds A's settled artifact (stale) while
    // localBase is now B — the id mismatch guard must block instantiation.
    expect(instantiateSpy).not.toHaveBeenCalled();

    // Only once B's own compile settles does the deferred commit complete.
    settleFor(BASE_B);
    expect(instantiateSpy).toHaveBeenCalledTimes(1);
    expect(instantiateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: BASE_B.id }),
      expect.anything(),
    );
  });
});
