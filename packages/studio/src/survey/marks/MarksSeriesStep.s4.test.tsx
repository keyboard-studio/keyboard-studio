// MarksSeriesStep S4 output-form station, open choice and backspace question.
// Split from the former single MarksSeriesStep.test.tsx; see MarksSeriesStep.testkit.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { backspaceStepsForBehaviour } from "./OutputFormStation.tsx";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { ACUTE, seedAlphabet } from "./MarksSeriesStep.testkit.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// S4 output-form station (#2297: the composition question, in its own terms)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 output-form station (#2297)", () => {
  const SCHWA = "ə"; // no ready-made accented forms exist

  function reachOutputForm(): void {
    fireEvent.click(screen.getByTestId("marks-continue")); // past S1
  }

  it("asks the composition question as an open choice, with the actual code points per option", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    const station = screen.getByTestId("marks-output-form");
    expect(station.textContent).toContain("what should your keyboard send");
    // Always an open choice: two composition radios, however the posture
    // table looks. (The station also carries the backspace question's two
    // radios — scoped by name, those are asserted in the #2302 describe.)
    expect(station.querySelectorAll('input[name="marks-output-form"]')).toHaveLength(2);
    // The author's own combination, both ways: é as one character vs e + mark.
    expect(screen.getByTestId("output-form-codepoints-ready-made").textContent).toContain("U+00E9");
    expect(screen.getByTestId("output-form-codepoints-base-plus-mark").textContent).toContain("U+0065");
    expect(screen.getByTestId("output-form-codepoints-base-plus-mark").textContent).toContain("U+0301");
  });

  it("suggests base-plus-mark from the default postfix order, tagged and listed first", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    const station = screen.getByTestId("marks-output-form");
    const labels = station.querySelectorAll("label");
    expect(labels[0]?.textContent).toContain("Send the letter and its mark as separate characters");
    expect(labels[0]?.textContent).toContain("(suggested)");
    const suggested = screen.getByLabelText(
      /Send the letter and its mark as separate characters/,
    ) as HTMLInputElement;
    expect(suggested.checked).toBe(true);
    // The premise names the suggestion's source: the input-order answer.
    expect(screen.getByTestId("output-form-premise").textContent).toContain(
      "you type the letter first, then its mark",
    );
  });

  it("shows ONE step-by-step backspace preview, in the backspace question (consequence, not typing demo)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    // #2302: the preview keys off the recorded backspace answer, so there
    // is exactly one — under the backspace question, not one per
    // composition option (the per-option pair stated each form's NATIVE
    // behaviour as if it were the behaviour, which was the contradiction).
    expect(screen.getAllByTestId("backspace-preview")).toHaveLength(1);
    expect(screen.getByTestId("marks-backspace").contains(screen.getByTestId("backspace-preview"))).toBe(true);
  });

  it("ready-made stays choosable when a pair has no ready-made form — the fallback is a note, not a ban", () => {
    seedAlphabet([ACUTE], [SCHWA]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    // Two composition radios even here: the retired FR-014 forcing offered none.
    expect(
      screen.getByTestId("marks-output-form").querySelectorAll('input[name="marks-output-form"]'),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    const readyMade = screen.getByLabelText(
      /Send each accented letter as one single ready-made character/,
    ) as HTMLInputElement;
    expect(readyMade.checked).toBe(true);
    // ...and the answer is NOT clamped back: the fallback note appears instead.
    expect(screen.getByTestId("output-form-fallback-note").textContent).toContain(
      "no single ready-made character",
    );
  });

  it("a confirmed composition answer does NOT move when only the input order changes", () => {
    // A productive, fully-composable alphabet: the treatment screen renders
    // (with this test file's small seeds it is skipped as undecidable, and
    // there would be no order answer to change).
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["a", "e", "i"],
        marks: [ACUTE, "̀"],
        attestedStacks: [
          { base: "a", marks: [ACUTE] },
          { base: "e", marks: [ACUTE] },
          { base: "i", marks: [ACUTE] },
          { base: "a", marks: ["̀"] },
          { base: "e", marks: ["̀"] },
          { base: "i", marks: ["̀"] },
        ],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    const walkTo = (id: string): void => {
      for (let i = 0; i < 6 && screen.queryByTestId(id) === null; i++) {
        fireEvent.click(screen.getByTestId("marks-continue"));
      }
    };
    const walkBackTo = (id: string): void => {
      for (let i = 0; i < 6 && screen.queryByTestId(id) === null; i++) {
        fireEvent.click(screen.getByTestId("marks-back"));
      }
    };
    walkTo("marks-treatment"); // order answer lives here: postfix (seeded default)
    walkTo("marks-output-form");
    // Suggestion is base-plus-mark (postfix pairing) and it is the answer.
    expect(
      (screen.getByLabelText(/Send the letter and its mark as separate characters/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByTestId("marks-continue")); // record the S4 answer, advance
    // Walk back to the treatment station and flip ONLY the input order.
    walkBackTo("marks-treatment");
    fireEvent.click(screen.getByTestId("input-order-option-prefix"));
    walkTo("marks-output-form");
    // The suggestion moved to ready-made (prefix pairing)...
    const readyMadeLabel = screen
      .getByLabelText(/Send each accented letter as one single ready-made character/)
      .closest("label");
    expect(readyMadeLabel?.textContent).toContain("(suggested)");
    // ...but the confirmed composition answer did not follow it.
    expect(
      (screen.getByLabelText(/Send the letter and its mark as separate characters/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Send each accented letter as one single ready-made character/) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("SC-005: the station never renders the words Unicode or normalization", () => {
    for (const bases of [["e"], [SCHWA]]) {
      cleanup();
      useWorkingCopyStore.getState().reset();
      useSurveyAnswerStore.getState().reset();
      seedAlphabet([ACUTE], bases);
      act(() => {
        render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
      });
      reachOutputForm();
      const text = screen.getByTestId("marks-output-form").textContent ?? "";
      expect(text).not.toMatch(/unicode/i);
      expect(text).not.toMatch(/normali[sz]/i);
    }
  });
});


// ---------------------------------------------------------------------------
// S4 open choice (#2297: suggestion follows the order pairing; overridable)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 open choice (#2297)", () => {
  const GRAVE = "̀";
  const SCHWA_BASE = "ə"; // no ready-made accented forms exist

  function seedComposableProductiveAlphabet(): void {
    // Every pair composes (a/e/i with acute+grave all have ready-made forms)
    // and the wide spread makes the class productive (own-key marks).
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

  function reachStation(id: string): void {
    for (let i = 0; i < 6 && screen.queryByTestId(id) === null; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
  }

  it("renders as an OPEN choice with the suggested option first and previews for both", () => {
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");
    const station = screen.getByTestId("marks-output-form");
    const radios = station.querySelectorAll('input[name="marks-output-form"]');
    expect(radios).toHaveLength(2);
    // Suggested (base-plus-mark, from the postfix order) listed first + tagged.
    expect(station.textContent).toContain("(suggested)");
    const labels = station.querySelectorAll("label");
    expect(labels[0]?.textContent).toContain("Send the letter and its mark as separate characters");
    // One backspace preview (#2302), under the backspace question.
    expect(station.querySelectorAll('[data-testid="backspace-preview"]')).toHaveLength(1);
    // SC-005 holds on the open-choice rendering too.
    expect(station.textContent).not.toMatch(/unicode/i);
    expect(station.textContent).not.toMatch(/normali[sz]/i);
  });

  it("states the input order as the premise — never the treatment outcome", () => {
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");
    const premise = screen.getByTestId("output-form-premise").textContent ?? "";
    expect(premise).toContain("you type the letter first, then its mark");
    expect(premise).not.toContain("key of their own");
  });

  it("ready-made stays choosable after an alphabet edit adds a pair with no ready-made form", () => {
    // The retired #1762/FR-014 behaviour: the edit collapsed the station to
    // a notice with NO way back to ready-made — the answer was unrealisable
    // by decree. Under #2297 the edit re-proposes the composition answer
    // (the standing spec 079 evidence-key behaviour, flagged for
    // reconfirmation like every other station), but ready-made remains a
    // choosable radio, and once chosen it sticks — with the automatic
    // fallback stated as a note.
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");

    // Override the open choice to ready-made (the non-suggested option).
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    expect(
      (screen.getByLabelText(
        /Send each accented letter as one single ready-made character/,
      ) as HTMLInputElement).checked,
    ).toBe(true);

    // Edit the alphabet: schwa + acute has no ready-made form.
    act(() => {
      useWorkingCopyStore.getState().recordPhase({
        phase: "B",
        answers: [],
        alphabet: {
          bases: ["a", "e", "i", SCHWA_BASE],
          marks: [ACUTE, GRAVE],
          attestedStacks: [
            { base: "a", marks: [ACUTE] },
            { base: "e", marks: [ACUTE] },
            { base: "i", marks: [ACUTE] },
            { base: "a", marks: [GRAVE] },
            { base: "e", marks: [GRAVE] },
            { base: "i", marks: [GRAVE] },
            { base: SCHWA_BASE, marks: [ACUTE] },
          ],
          declaredRoles: {},
        },
      });
    });
    // The position never moves on an edit — walk forward to the station.
    reachStation("marks-output-form");

    // Still an open choice with ready-made among the radios (not a notice).
    const station = screen.getByTestId("marks-output-form");
    expect(station.querySelectorAll('input[name="marks-output-form"]')).toHaveLength(2);
    // Choose ready-made again: it sticks, and the fallback is a note.
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    expect(
      (screen.getByLabelText(
        /Send each accented letter as one single ready-made character/,
      ) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByTestId("output-form-fallback-note").textContent).toContain(
      "no single ready-made character",
    );
  });
});

// ---------------------------------------------------------------------------
// S4 backspace question (#2302: its own axis — interrelated with
// composition, yet independent; the suggestion follows composition)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 backspace question (#2302)", () => {
  it("backspaceStepsForBehaviour: the sequence is the ANSWER's, under either form", () => {
    const pair = { stack: { base: "e", marks: [ACUTE] }, hasReadyMadeForm: true };
    // Peel steps the letter down mark by mark under BOTH forms.
    expect(backspaceStepsForBehaviour(pair, "ready-made", "peel")).toEqual(["é", "e", ""]);
    expect(backspaceStepsForBehaviour(pair, "base-plus-mark", "peel")).toEqual(["é", "e", ""]);
    // Whole-stack clears the emitted letter in one press under BOTH forms.
    expect(backspaceStepsForBehaviour(pair, "ready-made", "whole-stack")).toEqual(["é", ""]);
    expect(backspaceStepsForBehaviour(pair, "base-plus-mark", "whole-stack")).toEqual(["é", ""]);
  });

  function reachOutputForm(): void {
    fireEvent.click(screen.getByTestId("marks-continue")); // past S1
  }

  function backspaceRadio(label: RegExp): HTMLInputElement {
    return screen.getByLabelText(label) as HTMLInputElement;
  }

  /** ⌫ separators in the preview = steps − 1: peel of é shows 2, whole-stack 1. */
  function previewSeparators(): number {
    return (screen.getByTestId("backspace-preview").textContent?.match(/⌫/g) ?? []).length;
  }

  it("asks the backspace question as its own headed question, in the as-was (#1791) wording", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    const backspaceSection = screen.getByTestId("marks-backspace");
    expect(backspaceSection.textContent).toContain("What should backspace do to an accented letter?");
    expect(backspaceSection.textContent).toContain(
      "Backspace removes one mark at a time (letter and mark kept separate)",
    );
    expect(backspaceSection.textContent).toContain(
      "Backspace removes the whole letter at once (one ready-made unit)",
    );
    // SC-005 holds for the backspace question too.
    expect(backspaceSection.textContent).not.toMatch(/unicode/i);
    expect(backspaceSection.textContent).not.toMatch(/normali[sz]/i);
  });

  it("suggests the behaviour that FOLLOWS the composition answer, tagged and listed first", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    // Default composition is base-plus-mark (postfix suggestion), so the
    // backspace suggestion is peel.
    const peel = backspaceRadio(/Backspace removes one mark at a time/);
    expect(peel.checked).toBe(true);
    const backspaceLabels = screen.getByTestId("marks-backspace").querySelectorAll("label");
    expect(backspaceLabels[0]?.textContent).toContain("Backspace removes one mark at a time");
    expect(backspaceLabels[0]?.textContent).toContain("recommended");
    // Follow: change the composition answer and the (unsaved) backspace
    // answer follows it to whole-stack.
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    expect(backspaceRadio(/Backspace removes the whole letter at once/).checked).toBe(true);
    expect(backspaceRadio(/Backspace removes one mark at a time/).checked).toBe(false);
  });

  it("the preview keys off the BACKSPACE answer, not the form — the override peels under ready-made", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    // base-plus-mark + peel (the follow pairing): é → e → (empty).
    expect(previewSeparators()).toBe(2);
    // Switch composition to ready-made; backspace follows to whole-stack:
    // é → (empty) in one press.
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    expect(previewSeparators()).toBe(1);
    // OVERRIDE backspace to peel under the ready-made form: the preview
    // peels again — before #2302 this state was unrepresentable and the
    // preview (derived from the form) would have kept claiming one press.
    fireEvent.click(screen.getByLabelText(/Backspace removes one mark at a time/));
    expect(backspaceRadio(/Backspace removes one mark at a time/).checked).toBe(true);
    expect(previewSeparators()).toBe(2);
  });

  it("records the backspace answer on the phase result and in the answers, independently of the form", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    reachOutputForm();
    // Composition: ready-made (override of the postfix suggestion).
    // Backspace: peel (override of the follow suggestion).
    fireEvent.click(
      screen.getByLabelText(/Send each accented letter as one single ready-made character/),
    );
    fireEvent.click(screen.getByLabelText(/Backspace removes one mark at a time/));
    // Walk the remaining stations to completion.
    for (let i = 0; i < 8 && onComplete.mock.calls.length === 0; i++) {
      const next = screen.queryByTestId("marks-continue");
      if (next === null) break;
      fireEvent.click(next);
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.marksOutputForm).toBe("ready-made");
    expect(result.marksBackspace).toBe("peel");
    expect(result.answers).toContainEqual({
      questionId: "marks.marks_output_form.backspace",
      answerType: "select",
      value: "peel",
    });
  });
});
