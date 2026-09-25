// useWorkToDo.marksParity — spec 079 US3 item 4: the hook's badge-feeding
// attachment view and MarksSeriesStep's own rendered checkboxes must be
// computed from the exact same reconciled data, never two independent reads
// that could silently disagree after an author overturns a default.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses, proposeAttachments } from "@keyboard-studio/engine";
import { MarksSeriesStep } from "../survey/marks/MarksSeriesStep.tsx";
import { reconciledAttachmentChecked } from "../survey/marks/marksViews.ts";
import { marksAttachmentKey } from "../steps/evidence.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";

const ACUTE = "́";

const ALPHABET: ConfirmedAlphabet = {
  bases: ["e", "a"],
  marks: [ACUTE],
  attestedStacks: [{ base: "e", marks: [ACUTE] }],
  declaredRoles: {},
};

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("MarksSeriesStep attachment checkboxes agree with the shared reconciled view (spec 079 US3 item 4)", () => {
  it("a saved overturned attachment renders unchecked, matching reconciledAttachmentChecked — the same function hooks/useWorkToDo.ts calls for its badge computation", () => {
    useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet: ALPHABET });
    const key = marksAttachmentKey(ALPHABET, ACUTE, "e");
    useSurveyAnswerStore.getState().saveAnswer("marks", `marks_attachment.${ACUTE}|e`, {
      value: false,
      answerType: "boolean",
      origin: "overturned",
      stage: "confirmed",
      evidenceKey: key,
      screenId: "marks_attachment",
    });

    act(() => {
      render(<MarksSeriesStep onComplete={() => {}} />);
    });
    const checkbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // What hooks/useWorkToDo.ts computes for the same store state, via the
    // exact same shared function the step just rendered from.
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const savedAnswers = useSurveyAnswerStore.getState().steps.marks?.answers ?? {};
    const hookView = reconciledAttachmentChecked(ALPHABET, proposals, savedAnswers);

    expect(hookView[ACUTE]?.["e"]).toBe(checkbox.checked);
  });
});
