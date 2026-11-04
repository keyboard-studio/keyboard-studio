// MarksSeriesStep spec 079 persistence.
// Split from the former single MarksSeriesStep.test.tsx; see MarksSeriesStep.testkit.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { type SurveyAnswer, type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveyAnswerStore, applySurveyAnswerSnapshot, getSurveyAnswerSnapshot, type SurveyAnswerSnapshot } from "../../stores/surveyAnswerStore.ts";
import { QuestionRecorderContext, type ScreenRecorder } from "../../lib/questionRecorder.ts";
import { ACUTE } from "./MarksSeriesStep.testkit.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// spec 079 T023/T024/T083 — answers persist per question, recorded per Next
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — spec 079 persistence (T023, T024, T083)", () => {
  const GRAVE = "̀";

  /**
   * Tonal fixture (bases a/e/i, marks acute+grave, every pair attested):
   * gives all FOUR stations — attachment (productive), treatment (a
   * productive above-marks class → a real class-level decision), output-form
   * (every pair composes, hasOwnKeyMark decides which policy row fires), and
   * stacking (the two marks' reachable sets overlap — FR-018).
   */
  function seedFixture(): void {
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["a", "e", "i"],
        marks: [ACUTE, GRAVE],
        attestedStacks: [
          { base: "a", marks: [ACUTE] },
          { base: "e", marks: [ACUTE] },
          { base: "i", marks: [ACUTE] },
          { base: "a", marks: [GRAVE] },
          { base: "e", marks: [GRAVE] },
          { base: "i", marks: [GRAVE] },
        ],
        declaredRoles: {},
      },
    });
  }

  /** Renders MarksSeriesStep wrapped in a recorder spy, returning the spy. */
  function renderWithRecorder(
    onComplete: (r: SurveyPhaseResult) => void = vi.fn(),
  ): ScreenRecorder & ReturnType<typeof vi.fn> {
    const recorder = vi.fn() as unknown as ScreenRecorder & ReturnType<typeof vi.fn>;
    render(
      <QuestionRecorderContext.Provider value={recorder}>
        <MarksStepHost onComplete={onComplete} />
      </QuestionRecorderContext.Provider>,
      { withStepNav: true },
    );
    return recorder;
  }

  it("T023: un-ticking attachments, changing treatment/order and stacking survive an unmount/remount with the SAME alphabet, at the same position", () => {
    seedFixture();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    // S1 — un-tick two attachments.
    const attachmentStation = screen.getByTestId("marks-attachment");
    const checkedBoxes = within(attachmentStation)
      .getAllByRole("checkbox")
      .filter((cb) => (cb as HTMLInputElement).checked) as HTMLInputElement[];
    expect(checkedBoxes.length).toBeGreaterThanOrEqual(2);
    const uncheckedLabels = [
      checkedBoxes[0]!.getAttribute("aria-label")!,
      checkedBoxes[1]!.getAttribute("aria-label")!,
    ];
    fireEvent.click(checkedBoxes[0]!);
    fireEvent.click(checkedBoxes[1]!);
    for (const label of uncheckedLabels) {
      expect((screen.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
    }
    fireEvent.click(screen.getByTestId("marks-continue"));

    // S2 — change a class treatment away from its recommendation, and set the
    // input order explicitly.
    expect(screen.getByTestId("marks-treatment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("treatment-option-above-1-composed"));
    fireEvent.click(screen.getByTestId("input-order-option-prefix"));
    expect(
      (screen.getByTestId("treatment-option-above-1-composed").querySelector("input") as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByTestId("marks-continue"));

    // S4 — output form: leave as proposed, just advance.
    expect(screen.getByTestId("marks-output-form")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));

    // S5 — change stacking to "allowed" (default proposal is "not allowed":
    // no attested multi-mark stack exists here, only overlapping reach).
    expect(screen.getByTestId("marks-stacking")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Yes — some letters carry two marks/ }));

    // Position: the third station beyond the first (index 3, "marks_stacking").
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_stacking");

    cleanup();

    // Revisit with the SAME alphabet — nothing re-seeds.
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    // Lands back on the stacking station (position unchanged).
    expect(screen.getByTestId("marks-stacking")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_stacking");
    expect(
      (screen.getByRole("radio", { name: /Yes — some letters carry two marks/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    // Step back through the walked stations and assert every control still
    // renders the saved value.
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> output form
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> treatment
    expect(screen.getByTestId("marks-treatment")).toBeTruthy();
    expect(
      (screen.getByTestId("treatment-option-above-1-composed").querySelector("input") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("input-order-option-prefix").querySelector("input") as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> attachment
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    for (const label of uncheckedLabels) {
      expect((screen.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
    }

    // Store-level check: every saved answer's value matches the edits above.
    const savedAnswers = useSurveyAnswerStore.getState().steps["marks"]?.answers ?? {};
    expect(savedAnswers["marks_treatment.class.above-1"]?.value).toBe("composed");
    expect(savedAnswers["marks_treatment.input_order"]?.value).toBe("prefix");
    expect(savedAnswers["marks_stacking.allowed"]?.value).toBe(true);
  });

  it("T070 (spec 079 US4): after a reload restore (applySurveyAnswerSnapshot before the first mount) the step opens on the saved station with the saved answers", () => {
    seedFixture();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    const attachmentStation = screen.getByTestId("marks-attachment");
    const firstChecked = within(attachmentStation)
      .getAllByRole("checkbox")
      .find((cb) => (cb as HTMLInputElement).checked) as HTMLInputElement;
    const uncheckedLabel = firstChecked.getAttribute("aria-label")!;
    fireEvent.click(firstChecked);
    fireEvent.click(screen.getByTestId("marks-continue"));
    fireEvent.click(screen.getByTestId("treatment-option-above-1-composed"));
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(screen.getByTestId("marks-output-form")).toBeTruthy();

    // What the durable draft holds, as JSON.
    const persisted = JSON.parse(JSON.stringify(getSurveyAnswerSnapshot())) as SurveyAnswerSnapshot;
    cleanup();

    // Cold start: empty store, restore, then the first mount.
    useSurveyAnswerStore.getState().reset();
    applySurveyAnswerSnapshot(persisted);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-output-form")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> treatment
    expect(
      (screen.getByTestId("treatment-option-above-1-composed").querySelector("input") as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" })); // -> attachment
    expect((screen.getByLabelText(uncheckedLabel) as HTMLInputElement).checked).toBe(false);
  });

  it("T024: each station's Next records that station's answers with `marks.<station>.<subject>` ids and existing AnswerTypes; the final station's Next does not call the recorder directly (it rides step completion)", () => {
    seedFixture();
    const onComplete = vi.fn();
    const recorder = renderWithRecorder(onComplete);

    // S1 Next — attachment answers, one per mark, char-list of accepted bases.
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(recorder).toHaveBeenCalledTimes(1);
    const [attachmentScreen, attachmentAnswers] = recorder.mock.calls[0] as [
      string,
      readonly SurveyAnswer[],
    ];
    expect(attachmentScreen).toBe("marks_attachment");
    expect(attachmentAnswers.map((a) => a.questionId).sort()).toEqual([
      `marks.marks_attachment.${ACUTE}`,
      `marks.marks_attachment.${GRAVE}`,
    ].sort());
    for (const a of attachmentAnswers) {
      expect(a.answerType).toBe("char-list");
      expect(a.value).toEqual(["a", "e", "i"]);
    }

    // S2 Next — treatment: class, input order (no mark override here, no
    // promotion picked).
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(recorder).toHaveBeenCalledTimes(2);
    const [treatmentScreen, treatmentAnswers] = recorder.mock.calls[1] as [
      string,
      readonly SurveyAnswer[],
    ];
    expect(treatmentScreen).toBe("marks_treatment");
    const treatmentIds = treatmentAnswers.map((a) => a.questionId);
    expect(treatmentIds).toContain("marks.marks_treatment.class.above-1");
    expect(treatmentIds).toContain("marks.marks_treatment.promoted");
    expect(treatmentIds).toContain("marks.marks_treatment.input_order");
    const classAnswer = treatmentAnswers.find(
      (a) => a.questionId === "marks.marks_treatment.class.above-1",
    );
    expect(classAnswer?.answerType).toBe("select");
    const promotedAnswer = treatmentAnswers.find(
      (a) => a.questionId === "marks.marks_treatment.promoted",
    );
    expect(promotedAnswer?.answerType).toBe("char-list");
    const orderAnswer = treatmentAnswers.find(
      (a) => a.questionId === "marks.marks_treatment.input_order",
    );
    expect(orderAnswer?.answerType).toBe("select");

    // S4 Next (output form) — recorded too; not applying mark guards yet.
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(recorder).toHaveBeenCalledTimes(3);
    const [outputScreen, outputAnswers] = recorder.mock.calls[2] as [string, readonly SurveyAnswer[]];
    expect(outputScreen).toBe("marks_output_form");
    expect(outputAnswers).toEqual([
      { questionId: "marks.marks_output_form.form", answerType: "select", value: expect.any(String) },
      // #2302: the backspace answer rides the same station's record.
      { questionId: "marks.marks_output_form.backspace", answerType: "select", value: expect.any(String) },
    ]);

    // S5 Next — stacking is the final station (#2374 removed the guard
    // station that used to close the series), so its answers ride step
    // completion (R-05), not a direct `recordQuestionAnswers` call.
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(recorder).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    // The completion result carries EVERY station's answers (R-04), including
    // the stacking answers this final Next resolved.
    const finalIds = result.answers.map((a) => a.questionId);
    expect(finalIds).toContain("marks.marks_stacking.allowed");
    expect(finalIds).toContain("marks.marks_stacking.stacks");
    expect(finalIds).toEqual(expect.arrayContaining(attachmentAnswers.map((a) => a.questionId)));
    expect(finalIds).toEqual(expect.arrayContaining(treatmentIds));
  });

  it("first entry writes the station it renders to the store, so the footer rings that station", () => {
    seedFixture();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position ?? null).toBeNull();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_attachment");
  });

  it("a saved station that is no longer visible is replaced in the store by the station rendered", () => {
    seedFixture();
    useSurveyAnswerStore.getState().setPosition("marks", "marks_no_longer_visible");
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_attachment");
  });

  it("T083: a position parked via setPosition before mount (what jumpToLocation does) lands on that station with its saved answers", () => {
    seedFixture();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue")); // -> treatment
    fireEvent.click(screen.getByTestId("treatment-option-above-1-composed"));
    cleanup();

    useSurveyAnswerStore.getState().setPosition("marks", "marks_treatment");
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-treatment")).toBeTruthy();
    expect(
      (screen.getByTestId("treatment-option-above-1-composed").querySelector("input") as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("T083: switching the studio tab away and back (unmount/remount, no Next) keeps a draft answer and records nothing", () => {
    seedFixture();
    const recorder = renderWithRecorder();
    // Toggle one attachment without pressing Next.
    const attachmentStation = screen.getByTestId("marks-attachment");
    const checkbox = within(attachmentStation).getAllByRole("checkbox")[0] as HTMLInputElement;
    const wasChecked = checkbox.checked;
    fireEvent.click(checkbox);
    expect(recorder).not.toHaveBeenCalled();

    cleanup();
    renderWithRecorder();

    const attachmentStationAfter = screen.getByTestId("marks-attachment");
    const checkboxAfter = within(attachmentStationAfter).getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(checkboxAfter.checked).toBe(!wasChecked);
    expect(recorder).not.toHaveBeenCalled();
  });
});
