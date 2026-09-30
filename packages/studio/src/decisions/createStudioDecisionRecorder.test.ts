// createStudioDecisionRecorder — a survey seed the author kept is recorded as
// the studio's suggestion, not as the author's own choice.
//
// The proposal comes from the saved answer (`SavedAnswer.proposal`, written by
// SurveyRunner when it pre-filled the field) through `getSavedAnswer`.

import { beforeEach, describe, expect, it } from "vitest";
import type { SurveyAnswer } from "@keyboard-studio/contracts";
import { createStudioDecisionRecorder } from "./createStudioDecisionRecorder.ts";
import { useDecisionLogStore } from "./decisionLogStore.ts";
import type { SavedAnswer } from "../steps/answerTypes.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

type Saved = Pick<SavedAnswer, "answerType" | "proposal">;

function recorderWith(saved: Record<string, Record<string, Saved>>) {
  return createStudioDecisionRecorder({
    getWorkingCopyState: () => useWorkingCopyStore.getState(),
    snapshotter: { captureAtBoundary: () => Promise.resolve(null), reset: () => {} },
    getSavedAnswer: (stepId, questionId) => saved[stepId]?.[questionId],
  });
}

function provenanceOf(questionId: string) {
  return useDecisionLogStore
    .getState()
    .record.entries.find(
      (e) => e.payload.kind === "survey-answer" && e.payload.questionId === questionId,
    )?.provenance;
}

function complete(recorder: ReturnType<typeof recorderWith>, answers: SurveyAnswer[]): void {
  recorder({ stepId: "phase_f_helpdocs", result: { phase: "F", answers } });
}

beforeEach(() => {
  useDecisionLogStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

describe("createStudioDecisionRecorder — saved survey proposals", () => {
  it("records a kept seed as tool-proposed, naming its source", () => {
    const recorder = recorderWith({
      phase_f_helpdocs: {
        pf_doc_language: { answerType: "select", proposal: { value: "bilingual", source: "identity" } },
      },
    });
    complete(recorder, [{ questionId: "pf_doc_language", answerType: "select", value: "bilingual" }]);
    expect(provenanceOf("pf_doc_language")).toEqual({ agency: "tool-proposed", source: "identity" });
  });

  it("records a kept sourceless default as tool-proposed with no source", () => {
    const recorder = recorderWith({
      phase_f_helpdocs: { pf_more_detail_gate: { answerType: "boolean", proposal: { value: "false" } } },
    });
    // The field holds "false"; the recorded answer holds the boolean.
    complete(recorder, [{ questionId: "pf_more_detail_gate", answerType: "boolean", value: false }]);
    expect(provenanceOf("pf_more_detail_gate")).toEqual({ agency: "tool-proposed" });
  });

  it("records an overturned seed as the author's own choice", () => {
    const recorder = recorderWith({
      phase_f_helpdocs: { pf_more_detail_gate: { answerType: "boolean", proposal: { value: "false" } } },
    });
    complete(recorder, [{ questionId: "pf_more_detail_gate", answerType: "boolean", value: true }]);
    expect(provenanceOf("pf_more_detail_gate")).toEqual({ agency: "hand-set" });
  });

  it("does not coerce a text seed that happens to read \"true\"", () => {
    const recorder = recorderWith({
      phase_f_helpdocs: { pf_credits: { answerType: "text", proposal: { value: "true", source: "base" } } },
    });
    complete(recorder, [{ questionId: "pf_credits", answerType: "text", value: "true" }]);
    expect(provenanceOf("pf_credits")).toEqual({ agency: "base-derived", source: "base" });
  });

  it("records an answer with no saved proposal as hand-set", () => {
    const recorder = recorderWith({});
    complete(recorder, [{ questionId: "pf_scope_variety", answerType: "text", value: "For Hausa." }]);
    expect(provenanceOf("pf_scope_variety")).toEqual({ agency: "hand-set" });
  });
});
