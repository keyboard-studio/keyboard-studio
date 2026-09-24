// Unit tests for StepHost's onBack gating (F7 defect 2 — "back button does not
// work"): StepHost must only ever hand a step's component an `onBack` prop
// when the manifest-level back-target genuinely exists (a non-empty sanitized
// history, or the "touch" step's always-available touch_seed_source
// re-entry). A stale "always show Back" render made the button visible,
// enabled, and inert at the very first step (and right after Start-over).
//
// The manifest is mocked down to two trivial editor-steps so this test
// exercises StepHost's own gating decision in isolation, without pulling in
// the real identity/choose_base panels' heavy dependencies (langtags lookup,
// the compile pipeline, etc.) — those are exercised by StudioShell.test.tsx's
// full-walk suite instead.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StepHost } from "./StepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { createStudioDecisionRecorder } from "../decisions/createStudioDecisionRecorder.ts";
import type { SourceSnapshotter } from "../decisions/snapshotSource.ts";
import type { ReducerDeps } from "../steps/reducer.ts";
import type { EditorStepProps } from "../steps/types.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Mocked manifest — two trivial editor-steps standing in for "identity" and
// "choose_base". Each renders its own id (so the test can assert which step
// is showing) plus a Back button, present only when StepHost hands it onBack.
// ---------------------------------------------------------------------------

function TrivialStep({ onBack }: EditorStepProps): React.ReactElement {
  return (
    <div>
      <span data-testid="step-marker">rendered</span>
      {onBack !== undefined && (
        <button type="button" onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}

// vi.mock's factory is hoisted above every top-level declaration in this
// file, so anything it closes over must be built through vi.hoisted rather
// than an ordinary top-level const/function (vitest docs: "no top level
// variables inside").
const { MARKS_RESULT, INVISIBLES_RESULT, makeFixedResultStep } = vi.hoisted(() => {
  /**
   * A fixed `SurveyPhaseResult` payload, for a "revisit a finished step,
   * complete again with no change" test (spec 079 T028) — the SAME payload
   * is submitted both times, so any new decision entry means the completion
   * path is not idempotent.
   */
  const marksResult = {
    phase: "C" as const,
    answers: [{ questionId: "marks.station.attachment", answerType: "select" as const, value: "confirmed" }],
  };

  const invisiblesResult = {
    phase: "C" as const,
    answers: [{ questionId: "invisibles.u200c", answerType: "boolean" as const, value: true }],
  };

  /**
   * A trivial single-screen step that completes with a FIXED payload on
   * click — standing in for a real multi-station (marks) or single-screen
   * (invisibles) step. What this file exercises is StepHost's own
   * completion-recording idempotency, not either step's internal UI (owned
   * elsewhere).
   */
  function makeStep(result: unknown) {
    return function FixedResultStep({
      onComplete,
      onBack,
    }: {
      onComplete: (r: unknown) => void;
      onBack?: () => void;
    }) {
      return (
        <div>
          <span data-testid="step-marker">rendered</span>
          <button type="button" data-testid="fixed-result-complete" onClick={() => onComplete(result)}>
            Complete
          </button>
          {onBack !== undefined && (
            <button type="button" onClick={onBack}>
              Back
            </button>
          )}
        </div>
      );
    };
  }

  return { MARKS_RESULT: marksResult, INVISIBLES_RESULT: invisiblesResult, makeFixedResultStep: makeStep };
});

vi.mock("../steps/manifest.ts", () => ({
  manifest: [
    {
      kind: "editor-step",
      id: "identity",
      title: "Identity",
      inputs: [],
      writes: [],
      component: TrivialStep,
    },
    {
      kind: "editor-step",
      id: "choose_base",
      title: "Choose base",
      inputs: [],
      writes: [],
      component: TrivialStep,
    },
    {
      kind: "editor-step",
      id: "marks",
      title: "Marks",
      inputs: [],
      writes: [],
      component: makeFixedResultStep(MARKS_RESULT),
    },
    {
      kind: "editor-step",
      id: "invisibles",
      title: "Invisible characters",
      inputs: [],
      writes: [],
      component: makeFixedResultStep(INVISIBLES_RESULT),
    },
  ],
}));

const fakeReducerDeps: ReducerDeps = {
  lockDesktop: vi.fn(),
  setTouchLayoutJson: vi.fn(),
  clearStale: vi.fn(),
  instantiateFromBase: vi.fn(),
  instantiateFromExisting: vi.fn(),
  buildTouchLayoutJson: vi.fn(() => ({ json: null, warnings: [] })),
  resolveBaseTouchJson: vi.fn(() => undefined),
  instantiateFromBaseIfConfirmed: vi.fn(() => true),
};

/** A snapshotter that captures nothing (mirrors reducer.decisionRecording.test.ts's inertSnapshotter). */
function inertSnapshotter(): SourceSnapshotter {
  return {
    captureAtBoundary: () => Promise.resolve(null),
    reset: () => {},
  };
}

/**
 * `fakeReducerDeps` plus a REAL decision recorder — the same
 * `createStudioDecisionRecorder` factory StudioShell.tsx and
 * reducer.decisionRecording.test.ts's `realRecorder()` both call, pointed at
 * the real working-copy store, with only the snapshotter faked out (spec 079
 * T028).
 */
function reducerDepsWithRealRecorder(): ReducerDeps {
  return {
    ...fakeReducerDeps,
    recordDecision: createStudioDecisionRecorder({
      getWorkingCopyState: () => useWorkingCopyStore.getState(),
      snapshotter: inertSnapshotter(),
    }),
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useDecisionLogStore.getState().reset();
});

describe("StepHost onBack gating (F7 defect 2)", () => {
  it("does not offer Back at the very first step (identity, empty history)", () => {
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByTestId("step-marker")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("offers Back after one manifest-step advance", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("clicking Back pops the manifest-level history via the shared dispatch", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    act(() => {
      screen.getByRole("button", { name: "Back" }).click();
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
    expect(useSurveySessionStore.getState().history).toEqual([]);
  });

  it("hides Back again after Start-over", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();

    act(() => {
      useSurveySessionStore.getState().reset();
    });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 079 T028 — re-completing a FINISHED step with NO change records zero
// new decision entries, leaves no stale consequence, and does not touch the
// working-copy IR. Driven through StepHost's real `handleComplete` path
// (recordPhase -> recordStepCompletion -> the injected recorder), per SC-005 /
// FR-006 / US1 scenario 4.
// ---------------------------------------------------------------------------

describe("StepHost — revisiting a finished step and completing with no change (spec 079 T028)", () => {
  it("a finished marks-shaped step: re-completing with the identical answers appends no new decision entry", () => {
    const deps = reducerDepsWithRealRecorder();

    act(() => {
      useSurveySessionStore.getState().advance("marks");
    });
    const first = render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });
    const entriesAfterFirstComplete = useDecisionLogStore.getState().record.entries.length;
    expect(entriesAfterFirstComplete).toBeGreaterThan(0);
    const irAfterFirstComplete = useWorkingCopyStore.getState().baseIr;
    first.unmount();

    // Revisit: land back on "marks" (a finished step) the way an ordinary
    // Back / journey-strip jump would.
    act(() => {
      useSurveySessionStore.getState().advance("marks");
    });
    render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });

    expect(useDecisionLogStore.getState().record.entries.length).toBe(entriesAfterFirstComplete);
    expect(useWorkingCopyStore.getState().baseIr).toBe(irAfterFirstComplete);
  });

  it("a finished single-screen step (invisibles): re-completing with the identical answers appends no new decision entry", () => {
    const deps = reducerDepsWithRealRecorder();

    act(() => {
      useSurveySessionStore.getState().advance("invisibles");
    });
    const first = render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });
    const entriesAfterFirstComplete = useDecisionLogStore.getState().record.entries.length;
    expect(entriesAfterFirstComplete).toBeGreaterThan(0);
    const irAfterFirstComplete = useWorkingCopyStore.getState().baseIr;
    first.unmount();

    act(() => {
      useSurveySessionStore.getState().advance("invisibles");
    });
    render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });

    expect(useDecisionLogStore.getState().record.entries.length).toBe(entriesAfterFirstComplete);
    expect(useWorkingCopyStore.getState().baseIr).toBe(irAfterFirstComplete);
  });
});

// ---------------------------------------------------------------------------
// spec 079 T029 — "verify by revisit test" (contracts/step-classification.md):
// choose_base is believed `working-copy`-compliant (the instantiated base
// IS the working copy) — this pins that an unmount/remount at "choose_base"
// with the same evidence leaves the chosen base untouched.
// ---------------------------------------------------------------------------

describe("StepHost — choose_base revisit keeps the instantiated base (spec 079 T029)", () => {
  it("an unmount/remount at choose_base with the same evidence leaves baseKeyboard/baseIr unchanged", () => {
    const ir = makeTestIR([]);
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    const baseKeyboardBefore = useWorkingCopyStore.getState().baseKeyboard;
    const baseIrBefore = useWorkingCopyStore.getState().baseIr;

    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    const first = render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByTestId("step-marker")).toBeTruthy();
    first.unmount();

    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByTestId("step-marker")).toBeTruthy();
    expect(useWorkingCopyStore.getState().baseKeyboard).toBe(baseKeyboardBefore);
    expect(useWorkingCopyStore.getState().baseIr).toBe(baseIrBefore);
  });
});
