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

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StepHost } from "./StepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  liveEntryForSlot,
  slotKeyOf,
  useDecisionLogStore,
} from "../decisions/decisionLogStore.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
  applyDecisionSnapshot,
  peekDecision,
} from "../stores/decisionStore.ts";
import { useSurveyAnswerStore, peekStepAnswers, applySurveyAnswerSnapshot } from "../stores/surveyAnswerStore.ts";
import { rehydrateAnswersFromDecisions } from "../lib/draftPersistence.ts";
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
const { MARKS_RESULT, INVISIBLES_RESULT, IDENTITY_RESULT, SECOND_COPYRIGHT_RESULT, makeFixedResultStep } = vi.hoisted(() => {
  /** Spec 088 T012: an identity-shaped survey completion (registry questions). */
  const identityResult = {
    phase: "A" as const,
    answers: [
      { questionId: "il_language_code", answerType: "text" as const, value: "fr" },
      { questionId: "il_copyright_holder", answerType: "text" as const, value: "Fixture Author" },
    ],
  };
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

  /** Spec 088 T034: il_copyright_holder answered again, from another step. */
  const secondCopyrightResult = {
    phase: "A" as const,
    answers: [
      { questionId: "il_copyright_holder", answerType: "text" as const, value: "Second Author" },
    ],
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

  return {
    MARKS_RESULT: marksResult,
    INVISIBLES_RESULT: invisiblesResult,
    IDENTITY_RESULT: identityResult,
    SECOND_COPYRIGHT_RESULT: secondCopyrightResult,
    makeFixedResultStep: makeStep,
  };
});

vi.mock("../steps/manifest.ts", () => ({
  manifest: [
    {
      kind: "editor-step",
      id: "identity",
      title: "Identity",
      inputs: [],
      writes: [],
      component: makeFixedResultStep(IDENTITY_RESULT),
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
    {
      // Spec 088 T034: in this test registry, il_copyright_holder ALSO lives
      // on project_name — the "question moved steps" arrangement SC-005
      // is about. Production places it on identity only.
      kind: "editor-step",
      id: "project_name",
      title: "Project name",
      inputs: [],
      writes: [],
      component: makeFixedResultStep(SECOND_COPYRIGHT_RESULT),
    },
  ],
  // Spec 091 T008/T016: steps/stepOrder.ts re-publishes the manifest's
  // derivation (derivedScreens/screenTrails), and steps/advance.ts reads
  // the gates from this module — the stub models them for its five steps,
  // mirroring the real trails (project_name is the gated side trail).
  derivedScreens: [
    { id: "identity", kind: "question", group: "identity", decisionIds: ["language-name", "language-region", "language-autonym", "language-code", "target-script", "author-name", "author-email", "copyright-holder"], moduleIds: [], spine: true },
    { id: "choose_base", kind: "custom", decisionIds: ["base-keyboard"], moduleIds: [], spine: true },
    { id: "marks", kind: "custom", decisionIds: ["marks-treatment"], moduleIds: [], spine: true },
    { id: "invisibles", kind: "custom", decisionIds: ["invisibles-inventory"], moduleIds: [], spine: true },
    { id: "project_name", kind: "question", group: "project_name", decisionIds: ["project-display-name", "project-keyboard-id"], moduleIds: [], spine: false, joinTarget: "characters" },
  ],
  screenTrails: new Map([
    ["identity", { spine: true }],
    ["choose_base", { spine: true }],
    ["marks", { spine: true }],
    ["invisibles", { spine: true }],
    ["project_name", { spine: false, joinTarget: "characters" }],
    ["package", { spine: true }],
  ]),
  screenGates: new Map(),
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

/**
 * `fakeReducerDeps` plus the REAL decision store wiring — the same four
 * lambdas StudioShell injects (spec 088 T012/T014), pointed at the real
 * stores.
 */
function reducerDepsWithDecisionStore(): ReducerDeps {
  return {
    ...fakeReducerDeps,
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    readDecisionSet: () => getDecisionSnapshot(),
    getSavedAnswer: (stepId, questionId) => peekStepAnswers(stepId)?.answers[questionId],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id,
  };
}

afterEach(() => {
  cleanup();
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

// ---------------------------------------------------------------------------
// spec 088 T012 (US1 / SC-001, store-level through the real StepHost): an
// identity completion writes decision records; a reload (draft slices
// re-applied into fresh stores) restores the answers FROM the decisions,
// with value and provenance intact.
// ---------------------------------------------------------------------------

describe("StepHost — decision records survive a reload (spec 088 T012)", () => {
  it("identity completion writes records; re-applying the draft slices restores answers from decisions", () => {
    useDecisionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
    // The runner's saved answers at completion time (no proposals → asked).
    const save = useSurveyAnswerStore.getState().saveAnswer;
    save("identity", "il_language_code", {
      value: "fr", answerType: "text", origin: "confirmed", stage: "confirmed",
      evidenceKey: null, screenId: "il_language_code",
    });
    save("identity", "il_copyright_holder", {
      value: "Fixture Author", answerType: "text", origin: "confirmed", stage: "confirmed",
      evidenceKey: null, screenId: "il_copyright_holder",
    });

    const deps = reducerDepsWithDecisionStore();
    act(() => {
      useSurveySessionStore.getState().advance("identity");
    });
    render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });

    const snapshot = getDecisionSnapshot();
    expect(snapshot["language-code"]).toMatchObject({ value: "fr", provenance: "asked", step: "identity" });
    expect(snapshot["copyright-holder"]).toMatchObject({ value: "Fixture Author", provenance: "asked", step: "identity" });

    // Reload: fresh stores, draft slices re-applied the way
    // applyEnvelopeToStores does it (decisions slice + rehydrated answers).
    useDecisionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
    applyDecisionSnapshot(snapshot);
    applySurveyAnswerSnapshot(
      rehydrateAnswersFromDecisions(getDecisionSnapshot(), { steps: {}, recordedScreenOf: {} }, 1234),
    );

    expect(getDecisionSnapshot()["language-code"]).toMatchObject({ value: "fr", provenance: "asked" });
    const restored = peekStepAnswers("identity")?.answers;
    expect(restored?.["il_language_code"]?.value).toBe("fr");
    expect(restored?.["il_copyright_holder"]?.value).toBe("Fixture Author");
  });
});

// ---------------------------------------------------------------------------
// Spec 088 US4 — SC-005: a question that moves steps keeps ONE decision.
// The test manifest above places il_copyright_holder on identity AND on
// project_name (production: identity only). Answering it in both places,
// through the real StepHost, must leave a single copyright-holder record
// and a single trail chain (T031's decision-keyed slots), across a reload.
// ---------------------------------------------------------------------------

describe("spec 088 SC-005 — moved question, one decision", () => {
  it("answering il_copyright_holder in two steps yields one record and one trail chain, surviving reload", () => {
    useDecisionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
    useDecisionLogStore.getState().reset();
    const save = useSurveyAnswerStore.getState().saveAnswer;
    save("identity", "il_language_code", {
      value: "fr", answerType: "text", origin: "confirmed", stage: "confirmed",
      evidenceKey: null, screenId: "il_language_code",
    });
    save("identity", "il_copyright_holder", {
      value: "Fixture Author", answerType: "text", origin: "confirmed", stage: "confirmed",
      evidenceKey: null, screenId: "il_copyright_holder",
    });
    save("project_name", "il_copyright_holder", {
      value: "Second Author", answerType: "text", origin: "confirmed", stage: "confirmed",
      evidenceKey: null, screenId: "il_copyright_holder",
    });

    const deps: ReducerDeps = {
      ...reducerDepsWithDecisionStore(),
      recordDecision: reducerDepsWithRealRecorder().recordDecision,
    };
    act(() => {
      useSurveySessionStore.getState().advance("identity");
    });
    render(<StepHost reducerDeps={deps} onStartOver={() => {}} />);
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });
    expect(peekDecision("copyright-holder")).toMatchObject({ value: "Fixture Author", step: "identity" });

    // The question "moves": project_name now asks it, with a new answer.
    act(() => {
      useSurveySessionStore.getState().advance("project_name");
    });
    act(() => {
      fireEvent.click(screen.getByTestId("fixed-result-complete"));
    });

    // One decision record, holding the latest answer and its step.
    expect(peekDecision("copyright-holder")).toMatchObject({ value: "Second Author", step: "project_name" });

    // The trail shows both entries under the one decision — the second
    // supersedes the first even though the steps differ (C-5).
    const allEntries = useDecisionLogStore.getState().record.entries;
    const entries = allEntries.filter(
      (e) => e.payload.kind === "survey-answer" && e.payload.questionId === "il_copyright_holder",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ stepId: "identity" });
    expect(entries[1]).toMatchObject({ stepId: "project_name", supersedes: entries[0]!.entryId });
    expect(
      liveEntryForSlot(allEntries, slotKeyOf("identity", entries[0]!.payload))?.entryId,
    ).toBe(entries[1]!.entryId);

    // Reload: the current record survives the move, and the answer
    // rehydrates under the step that asked it last.
    const snapshot = getDecisionSnapshot();
    useDecisionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
    applyDecisionSnapshot(snapshot);
    applySurveyAnswerSnapshot(
      rehydrateAnswersFromDecisions(getDecisionSnapshot(), { steps: {}, recordedScreenOf: {} }, 1234),
    );
    expect(getDecisionSnapshot()["copyright-holder"]).toMatchObject({ value: "Second Author" });
    expect(peekStepAnswers("project_name")?.answers["il_copyright_holder"]?.value).toBe("Second Author");
  });
});
