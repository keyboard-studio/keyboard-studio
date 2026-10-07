// Regression test — spec 089 apply path, found by CI (PR #1974, run
// 37584690376): every e2e walk that leaves il_copyright_holder blank (the
// D1 default case — "same as the author") reached the Output screen with
// the download blocked: "the keyboard needs an author and a copyright
// holder". The same lane was green on spec 088 alone.
//
// Mechanism: SurveyRunner's completion result omits UNANSWERED questions
// entirely (stack entries with `value === undefined` are skipped, and the
// terminal question's answer is appended only when its committed value is
// not undefined). The pre-089 IdentityLiteAdapter computed attribution
// from the whole result unconditionally, so a blank holder still landed
// the D1 default. Spec 089 replaced that write with
// il_copyright_holder.apply — but the runner dispatched apply ONLY per
// answer, so the one module that owns the attribution channel never ran
// when its (optional, terminal) question was left blank.
//
// This test follows the LIVE sequence, not the golden-walk harness's:
// the golden walk's IdentityLite stub emits a hand-built result that
// includes an il_copyright_holder answer, which is why it stayed green.
// Here the REAL IdentityLite/SurveyRunner produces the result (resume to
// the attribution questions, type the author name, leave email and holder
// blank), and the result is fed through StepHost's completion order —
// recordPhase -> recordAnswersAsDecisions -> applyDecisionEffects — with
// ReducerDeps composed over the REAL stores exactly as StudioShell
// composes them (checked IR merge first, then overlay channels).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { IdentityLite } from "../survey/IdentityLite.tsx";
import {
  applyDecisionEffects,
  recordAnswersAsDecisions,
  type ReducerDeps,
} from "./reducer.ts";
import { applyMutatePatch } from "./mutateApply.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
} from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { peekStepAnswers } from "../stores/surveyAnswerStore.ts";

afterEach(cleanup);

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.setState({ attribution: null, ir: null });
});

/** ReducerDeps over the real stores — StudioShell's composition, verbatim
 *  for the decision/apply fields; no-ops for the unrelated reducer deps. */
function makeLiveDeps(): ReducerDeps {
  return {
    lockDesktop: () => {},
    clearStale: () => {},
    setTouchLayoutJson: () => {},
    instantiateFromBase: () => {},
    instantiateFromExisting: () => {},
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: () => true,
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    readDecisionSet: () => getDecisionSnapshot(),
    getDecisions: () => getDecisionSnapshot(),
    getSavedAnswer: (stepId, questionId) =>
      peekStepAnswers(stepId)?.answers[questionId],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    applyWorkingCopyPatch: (patch, writes) => {
      const wc = useWorkingCopyStore.getState();
      if (patch.ir !== undefined && wc.ir !== null) {
        wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
      }
      if (patch.identity !== undefined) wc.setIdentity(patch.identity);
      if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
      if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
      if (patch.historyEntryState !== undefined)
        wc.setHistoryEntryState(patch.historyEntryState);
    },
  };
}

/** StepHost.handleComplete's SurveyPhaseResult block, in its order. */
function completeIdentityStep(result: SurveyPhaseResult): void {
  useWorkingCopyStore.getState().recordPhase(result, { stepId: "identity" });
  const deps = makeLiveDeps();
  recordAnswersAsDecisions(result, "identity", deps);
  applyDecisionEffects(result, deps);
}

/** Answers replayed via `resume`, mounting on the first unanswered question. */
function completedThroughScript(): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_english", answerType: "text", value: "Hausa" },
      { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
      { questionId: "il_language_code", answerType: "text", value: "ha" },
      { questionId: "il_target_script", answerType: "select", value: "Latn" },
    ],
  };
}

function finish(): void {
  fireEvent.click(screen.getByTestId("survey-advance"));
}

function type(value: string): void {
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value } });
}

function driveIdentityLite() {
  const onComplete = vi.fn();
  render(
    <IdentityLite onComplete={onComplete} resume={completedThroughScript()} />,
    { withStepNav: true },
  );
  type("Test Author");
  finish();
  finish(); // author email — left blank (optional)
  return onComplete;
}

describe("identity completion through the live apply path (spec 089 regression)", () => {
  it("lands the D1 attribution when the copyright holder is left blank", () => {
    const onComplete = driveIdentityLite();
    finish(); // copyright holder — left blank; D1 defaults it to the author

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result] = onComplete.mock.calls[0]! as [SurveyPhaseResult];
    // The live result carries NO il_copyright_holder answer at all — the
    // fact the per-answer dispatch tripped over.
    expect(result.answers.map((a) => a.questionId)).not.toContain("il_copyright_holder");

    completeIdentityStep(result);

    expect(getDecisionSnapshot()["author-name"]?.value).toBe("Test Author");
    expect(useWorkingCopyStore.getState().attribution).toEqual({
      authorName: "Test Author",
      copyrightHolder: "Test Author",
    });
  });

  it("lands an explicitly entered copyright holder (answered path)", () => {
    const onComplete = driveIdentityLite();
    type("Hausa Language Committee");
    finish(); // copyright holder — explicitly entered

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result] = onComplete.mock.calls[0]! as [SurveyPhaseResult];
    expect(result.answers.map((a) => a.questionId)).toContain("il_copyright_holder");

    completeIdentityStep(result);

    expect(useWorkingCopyStore.getState().attribution).toEqual({
      authorName: "Test Author",
      copyrightHolder: "Hausa Language Committee",
    });
  });
});
