// MarksSeriesStep targeted re-proposal, recorded stacks and start-of-line migration.
// Split from the former single MarksSeriesStep.test.tsx; see MarksSeriesStep.testkit.ts.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { type ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { EMPTY_MARKS_VALUE, getMarksTreatmentValue, recordMarksTreatmentValue, type MarksTreatmentValue } from "./marksValue.ts";
import { ATTACHMENT_START_OF_LINE } from "./marksViews.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { ACUTE, seedAlphabet, seedFullAlphabet } from "./MarksSeriesStep.testkit.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// spec 079 US3 — targeted re-proposal, flags, gate (T045, T046, T058, T082)
// ---------------------------------------------------------------------------


describe("MarksSeriesStep — US3 targeted re-proposal (T045, T046, T058, T082)", () => {
  const TWO_BASE_ALPHABET: ConfirmedAlphabet = {
    bases: ["e", "a"],
    marks: [ACUTE],
    attestedStacks: [
      { base: "e", marks: [ACUTE] },
      { base: "a", marks: [ACUTE] },
    ],
    declaredRoles: {},
  };

  it("adding one base letter flags only that base's attachment answers; everything else stays unflagged (SC-003)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    // Confirm the attachment station once, so its screen counts as "already
    // confirmed" (the flag rule's item-4(b) condition) and move to treatment.
    // `markScreenRecorded` is what a real StepHost's `onScreenRecorded` wiring
    // calls on Next; this bare-component test simulates that directly since it
    // renders outside StepHost's QuestionRecorderContext wiring.
    fireEvent.click(screen.getByTestId("marks-continue"));
    useSurveyAnswerStore.getState().markScreenRecorded("marks", "marks_attachment", "h1");
    cleanup();

    // Add a third base, attested for the same mark.
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    // Position was saved at "marks_treatment" (or later); the earlier,
    // now-flagged attachment screen surfaces through FlaggedAnswersList, and
    // Next is blocked until it is resolved (FR-013) — the author's position
    // is NOT moved back to it (FR-004).
    const list = screen.getByTestId("flagged-answers-list");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(list.textContent).toContain("b");
    expect((screen.getByTestId("marks-continue") as HTMLButtonElement).disabled).toBe(true);

    // The author's position was NOT moved (FR-004): still on/after treatment,
    // not bounced back to the attachment station.
    expect(screen.queryByTestId("marks-attachment")).toBeNull();
  });

  it("the blocked footer Continue is described by the in-body 'why blocked' hint (spec 081 FR-033)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue"));
    useSurveyAnswerStore.getState().markScreenRecorded("marks", "marks_attachment", "h1");
    cleanup();
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    const cont = screen.getByTestId("marks-continue") as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    const hintId = cont.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    const hint = document.getElementById(hintId!);
    expect(hint?.textContent).toMatch(/Resolve the flagged answer above before continuing/);
    // The hint stays in the step body, not in the footer group (FR-016).
    expect(screen.getByRole("group", { name: "Step navigation" }).contains(hint)).toBe(false);
  });

  it("explicit input order survives an unrelated evidence change while still applicable (FR-012)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    useSurveyAnswerStore.getState().saveAnswer("marks", "marks_treatment.input_order", {
      value: "prefix",
      answerType: "select",
      origin: "overturned",
      stage: "confirmed",
      evidenceKey: "ord|", // no own-key marks in this fixture
      screenId: "marks_treatment",
    });
    cleanup();
    // An unrelated letter addition: ownKeyMarks is still empty (no mark earns
    // its own key here), so the order key is unchanged and the explicit
    // choice is neither flagged nor reset.
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    const saved = useSurveyAnswerStore.getState().steps.marks?.answers["marks_treatment.input_order"];
    expect(saved?.value).toBe("prefix");
  });

  it("add-then-remove a letter before revisiting shows no flags and the original answers (FR-014)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue"));
    cleanup();

    // Add, then remove again — back to the original evidence.
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
    expect((screen.getByTestId("marks-continue") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a flagged answer shows its catalog reason", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue"));
    useSurveyAnswerStore.getState().markScreenRecorded("marks", "marks_attachment", "h1");
    cleanup();
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("flagged-answers-list").textContent).toMatch(/you added/i);
  });

  it("confirming a station re-stamps its answers' evidence key, clearing the flag (FR-041)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue")); // confirms attachment
    useSurveyAnswerStore.getState().markScreenRecorded("marks", "marks_attachment", "h1");
    cleanup();
    seedFullAlphabet({
      ...TWO_BASE_ALPHABET,
      bases: ["e", "a", "b"],
      attestedStacks: [...TWO_BASE_ALPHABET.attestedStacks, { base: "b", marks: [ACUTE] }],
    });
    // Jump straight back to the attachment station and confirm it again.
    useSurveyAnswerStore.getState().setPosition("marks", "marks_attachment");
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    const answer = useSurveyAnswerStore.getState().steps.marks?.answers["marks_attachment.́|b"];
    expect(answer?.stage).toBe("confirmed");
    cleanup();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });

  it("removing the last diacritic keeps the saved answers and shows no work-to-do; restoring it renders them unflagged (T082, data-model.md §3 inactive/kept)", () => {
    seedFullAlphabet({ bases: ["e"], marks: [ACUTE], attestedStacks: [{ base: "e", marks: [ACUTE] }], declaredRoles: {} });
    const onComplete = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    // Walk to completion so every station's answers are saved.
    for (let i = 0; i < 10 && !onComplete.mock.calls.length; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    const savedBefore = useSurveyAnswerStore.getState().steps.marks?.answers ?? {};
    expect(Object.keys(savedBefore).length).toBeGreaterThan(0);
    cleanup();

    // Remove the last diacritic entirely — the series gate now skips.
    seedFullAlphabet({ bases: ["e"], marks: [], attestedStacks: [], declaredRoles: {} });
    const onCompleteAfterRemoval = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onCompleteAfterRemoval} />, { withStepNav: true });
    });
    expect(onCompleteAfterRemoval).toHaveBeenCalledTimes(1);
    // Answers are KEPT in the store, not cleared.
    expect(useSurveyAnswerStore.getState().steps.marks?.answers).toEqual(savedBefore);
    cleanup();

    // Restore the diacritic: every original answer renders unflagged again.
    seedFullAlphabet({ bases: ["e"], marks: [ACUTE], attestedStacks: [{ base: "e", marks: [ACUTE] }], declaredRoles: {} });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 106: the completion records only the stacks the author kept, because
// the mark guard and the whole-stack backspace are generated from them.
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — recorded stacks follow the stacking station (spec 106)", () => {
  const CIRC = "\u0302";
  function seedStacked(): void {
    useWorkingCopyStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["a", "e"],
        marks: [ACUTE, CIRC],
        attestedStacks: [
          { base: "a", marks: [ACUTE] },
          { base: "e", marks: [CIRC] },
          { base: "a", marks: [CIRC, ACUTE] },
        ],
        declaredRoles: {},
      },
    });
  }

  function walk(answerStacking: () => void): void {
    const onComplete = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    for (let i = 0; i < 8 && onComplete.mock.calls.length === 0; i++) {
      if (screen.queryByTestId("marks-stacking") !== null) answerStacking();
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(onComplete).toHaveBeenCalled();
  }

  const recordedStacks = () => getMarksTreatmentValue()?.completion?.stacks ?? [];

  it("keeps a confirmed multi-mark stack while stacking is allowed", () => {
    seedStacked();
    walk(() => {});
    expect(recordedStacks()).toContainEqual({ base: "a", marks: [CIRC, ACUTE] });
  });

  it("drops multi-mark stacks once stacking is answered no, keeping single marks", () => {
    seedStacked();
    walk(() => fireEvent.click(screen.getByRole("radio", { name: /^No/ })));
    expect(recordedStacks()).toEqual([
      { base: "a", marks: [ACUTE] },
      { base: "e", marks: [CIRC] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Issue #2374: the guard question is gone; its buffer-start role is the
// per-mark "start of line" box. Confirmed `emit` records migrate to ticked
// boxes (origin "migrated-from-guard"); everything else opens unticked.
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — #2374 start-of-line migration", () => {
  const SOL_ID = `marks_attachment.${ACUTE}|${ATTACHMENT_START_OF_LINE}`;

  function seedLegacyGuard(behaviour: "swallow" | "emit", confirmed: boolean): void {
    useDecisionStore.setState(useDecisionStore.getInitialState(), true);
    recordMarksTreatmentValue({
      ...EMPTY_MARKS_VALUE,
      guardSpecification: {
        recordId: `guard-specification:asked:${behaviour}`,
        behaviour,
        origin: "asked",
        confirmed,
        recordedAt: 0,
        supersedes: null,
      },
    } as unknown as MarksTreatmentValue);
  }

  function solBox(): HTMLInputElement {
    return screen.getByRole("checkbox", {
      name: /can appear at the start of a line/,
    }) as HTMLInputElement;
  }

  function savedSolAnswer() {
    return useSurveyAnswerStore.getState().steps.marks?.answers[SOL_ID];
  }

  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
  });

  it("a confirmed legacy emit migrates to a ticked box; the attachment commit saves it with origin migrated-from-guard", () => {
    seedAlphabet([ACUTE], ["e"]);
    seedLegacyGuard("emit", true);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    // The migration is visible in the row before any commit.
    expect(solBox().checked).toBe(true);
    fireEvent.click(screen.getByTestId("marks-continue"));
    const saved = savedSolAnswer();
    expect(saved?.value).toBe(true);
    expect(saved?.origin).toBe("migrated-from-guard");
    expect(saved?.stage).toBe("confirmed");
  });

  it("a confirmed legacy swallow is a no-op: the box opens unticked", () => {
    seedAlphabet([ACUTE], ["e"]);
    seedLegacyGuard("swallow", true);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(solBox().checked).toBe(false);
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(savedSolAnswer()?.value).toBe(false);
    expect(savedSolAnswer()?.origin).toBe("confirmed");
  });

  it("a seeded-but-unconfirmed emit record is dropped, never adopted", () => {
    seedAlphabet([ACUTE], ["e"]);
    seedLegacyGuard("emit", false);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(solBox().checked).toBe(false);
  });

  it("the author can untick a migrated tick (changeable, not locked)", () => {
    seedAlphabet([ACUTE], ["e"]);
    seedLegacyGuard("emit", true);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(solBox().checked).toBe(true);
    fireEvent.click(solBox());
    expect(solBox().checked).toBe(false);
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(savedSolAnswer()?.value).toBe(false);
  });

  it("Track 2: an all-unguarded import seeds ticked boxes with origin imported", () => {
    seedAlphabet([ACUTE], ["e"]);
    useDecisionStore.setState(useDecisionStore.getInitialState(), true);
    act(() => {
      useDecisionStore.getState().record({
        id: "authoring-track",
        value: "adapt",
        provenance: "asked",
      });
    });
    // An imported keyboard whose T_ mark key produces its mark unguarded.
    const startIr = makeTestIR({
      groups: [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          rules: [
            {
              nodeId: "rule#p",
              context: [{ kind: "vkey", name: "T_0300", modifiers: [] }],
              output: [{ kind: "char" as const, value: ACUTE }],
            },
          ],
          readonly: false,
        },
      ],
      touchLayout: {
        platforms: [
          {
            id: "phone",
            layers: [{ id: "default", rows: [{ keys: [{ nodeId: "touchKey#1", id: "T_0300", text: "◌́" }] }] }],
          },
        ],
        nodeIds: [],
      },
    });
    useWorkingCopyStore.setState({ startIr });
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(solBox().checked).toBe(true);
    fireEvent.click(screen.getByTestId("marks-continue"));
    const saved = savedSolAnswer();
    expect(saved?.value).toBe(true);
    expect(saved?.origin).toBe("imported");
  });

  it("a tick the author sets themselves records origin overturned, not a migration origin", () => {
    seedAlphabet([ACUTE], ["e"]);
    useDecisionStore.setState(useDecisionStore.getInitialState(), true);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(solBox().checked).toBe(false);
    fireEvent.click(solBox());
    fireEvent.click(screen.getByTestId("marks-continue"));
    const saved = savedSolAnswer();
    expect(saved?.value).toBe(true);
    expect(saved?.origin).toBe("overturned");
  });
});
