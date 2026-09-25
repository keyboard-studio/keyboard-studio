// MarksSeriesStep — S0 gate behavior (spec 071 US1).
//
// The gate never renders: a marks-free alphabet completes the step immediately
// with an EMPTY worklist on forward entry, and keeps popping backward on a
// back-nav entry (transparent in both directions). A marked alphabet renders
// the series shell.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { ConfirmedAlphabet, SurveyAnswer, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { MarksSeriesStep, computeMarksGate } from "./MarksSeriesStep.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import {
  useSurveyAnswerStore,
  applySurveyAnswerSnapshot,
  getSurveyAnswerSnapshot,
  type SurveyAnswerSnapshot,
} from "../../stores/surveyAnswerStore.ts";
import { QuestionRecorderContext, type ScreenRecorder } from "../../lib/questionRecorder.ts";

const ACUTE = "́";

function seedAlphabet(marks: string[], bases: string[] = ["e"]): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: {
      bases,
      marks,
      attestedStacks: marks.map((m) => ({ base: bases[0] ?? "e", marks: [m] })),
      declaredRoles: {},
    },
  });
}

afterEach(() => {
  cleanup();
});

describe("computeMarksGate (S0 — computed, never rendered)", () => {
  it("skips when there is no alphabet at all", () => {
    expect(computeMarksGate(undefined).skip).toBe(true);
  });

  it("skips when the marks store is empty (FR-005)", () => {
    const gate = computeMarksGate({
      bases: ["a", "b"],
      marks: [],
      attestedStacks: [],
      declaredRoles: {},
    });
    expect(gate.skip).toBe(true);
  });

  it("runs when at least one mark is confirmed — reachable again after an edit (US1 AC2)", () => {
    const empty = computeMarksGate({ bases: ["a"], marks: [], attestedStacks: [], declaredRoles: {} });
    expect(empty.skip).toBe(true);
    const edited = computeMarksGate({
      bases: ["a"],
      marks: [ACUTE],
      attestedStacks: [{ base: "a", marks: [ACUTE] }],
      declaredRoles: {},
    });
    expect(edited.skip).toBe(false);
  });
});

describe("MarksSeriesStep — S0 skip path", () => {
  it("completes immediately with an EMPTY worklist and renders nothing (forward entry)", () => {
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("marks-series")).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.marksWorklist).toEqual({
      ownLetterUnits: [],
      markUnits: [],
      blockedCombinations: [],
    });
  });

  it("pops backward instead of completing when entered via back-navigation", () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    // Simulate the Back press that landed here (back from carve into marks):
    // last traversal move was a pop.
    act(() => {
      useSurveySessionStore.getState().advance("marks");
      useSurveySessionStore.getState().advance("carve");
      useSurveySessionStore.getState().popHistory();
    });
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} onBack={onBack} />, { withStepNav: true });
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("MarksSeriesStep — series runs when marks exist", () => {
  it("renders the series shell instead of auto-completing", () => {
    seedAlphabet([ACUTE]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-series")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Station Back affordance gating (F7 sweep: an always-rendered Back button
// whose handler can silently no-op at the first station when StepHost omits
// onBack — same defect shape as the sibling gallery/panel sites). Predicate:
// render when stationIndex > 0 || onBack !== undefined (Back WITHIN the
// series must keep working even when the host has nothing to pop into).
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — station Back affordance gating", () => {
  it("first station + no onBack: renders no Back button", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("first station + onBack: Back is visible and calls onBack", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onBack = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} onBack={onBack} />, { withStepNav: true });
    });
    const backButton = screen.getByRole("button", { name: "Back" });
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("station > 0 + no onBack: Back is visible and steps the station back", () => {
    // Two marks attested on the SAME base cluster into one mark class
    // (jaccard similarity 1.0), so the class needs an on-screen treatment
    // confirmation — a second station beyond attachment.
    seedAlphabet([ACUTE, "̀"], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(screen.getByTestId("marks-treatment")).toBeTruthy();
    const backButton = screen.getByRole("button", { name: "Back" });
    fireEvent.click(backButton);
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// S1 attachment station (US2, FR-006/007/008)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S1 attachment station", () => {
  it("renders one row per mark with attested bases pre-checked", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    const station = screen.getByTestId("marks-attachment");
    expect(station).toBeTruthy();
    const checkbox = screen.getByLabelText(/e can carry/) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders a single-attested-base mark as an auto-confirmed summary (FR-008)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    const row = screen.getByTestId("attachment-row-U+0301");
    expect(row.tagName.toLowerCase()).toBe("details");
    expect(row.textContent).toContain("confirmed on");
  });

  it("states the unchecked-means-blocked consequence in the row help text (FR-007)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment").textContent).toContain(
      "will not take this mark",
    );
  });

  it("simple orthography completes in at most TWO marks screens (SC-002)", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    // Screen 1: the auto-confirmed attachment summary.
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    // Screen 2: the output-form notice.
    expect(screen.getByTestId("marks-output-form")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Lowercase-only diacritic base choices (spec 049, US1 + US2)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — lowercase-only base choices (spec 049)", () => {
  function seedCasedAlphabet(): void {
    // A cased Latin base: lowercase e/a with their uppercase counterparts, one
    // caseless-context-free mark. Acute attested on e and a.
    //
    // The lowercase-fold behavior below is gated on the working copy's
    // `casing` facet (spec 048 FR-006), not inferred per-character — so the
    // fixture must carry a derived-cased `baseIr`, matching what a real
    // Latin-base instantiation would populate.
    useWorkingCopyStore.setState({
      baseIr: { ...makeTestIR([]), facets: { casing: { value: "cased", provenance: "derived" } } },
    });
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E", "a", "A"],
        marks: [ACUTE],
        attestedStacks: [
          { base: "e", marks: [ACUTE] },
          { base: "a", marks: [ACUTE] },
        ],
        declaredRoles: {},
      },
    });
  }

  it("US1/SC-001: the attachment row offers no uppercase duplicate of a present lowercase", () => {
    seedCasedAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    // The row exposes one checkbox per offered base via its aria-label
    // "<base> can carry ...". Uppercase E / A must not appear as choices.
    expect(screen.queryByLabelText(/^E can carry/)).toBeNull();
    expect(screen.queryByLabelText(/^A can carry/)).toBeNull();
    // Lowercase counterparts remain offered.
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
  });

  it("spec 048 FR-006: the facet, not per-character Unicode casing, is the gate — a base the facet reports as NOT cased is never folded, even though Latin e/E, a/A ARE Unicode case pairs", () => {
    // Same bases/marks as seedCasedAlphabet, but the working copy's `casing`
    // facet reads caseless (e.g. an override, or a script the facet catalog
    // treats as caseless despite Unicode marking it bicameral — see the
    // Georgian note in casePair.ts). The interim per-character gate this
    // replaced would have folded E/A regardless; the facet-driven gate must not.
    useWorkingCopyStore.setState({
      baseIr: { ...makeTestIR([]), facets: { casing: { value: "caseless", provenance: "derived" } } },
    });
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E", "a", "A"],
        marks: [ACUTE],
        attestedStacks: [
          { base: "e", marks: [ACUTE] },
          { base: "a", marks: [ACUTE] },
        ],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    // No fold: every base is offered as its own choice.
    expect(screen.getByLabelText(/^E can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^A can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
  });

  it("spec 048 FR-006 sibling: a 'mixed' casing facet value gates the fold ON — same as 'cased', not 'caseless'", () => {
    // Same bases/marks as seedCasedAlphabet, but the facet reads "mixed" (the
    // keyboard attests both a cased and a caseless script — e.g. a Greek+Latin
    // transliteration keyboard with a trace caseless script). Every base here
    // (e/E, a/A) is still individually Latin and cased — caseCounterpart's
    // per-character Unicode-category test folds exactly those, unaffected by
    // whatever OTHER caseless script the keyboard also attests — so "mixed"
    // must behave identically to "cased", not "caseless".
    useWorkingCopyStore.setState({
      baseIr: { ...makeTestIR([]), facets: { casing: { value: "mixed", provenance: "derived" } } },
    });
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E", "a", "A"],
        marks: [ACUTE],
        attestedStacks: [
          { base: "e", marks: [ACUTE] },
          { base: "a", marks: [ACUTE] },
        ],
        declaredRoles: {},
      },
    });
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    // Folded: uppercase E/A are not offered as their own choice.
    expect(screen.queryByLabelText(/^E can carry/)).toBeNull();
    expect(screen.queryByLabelText(/^A can carry/)).toBeNull();
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
    // Case-pair count surfaced, same as the "cased" happy path.
    expect(screen.getByTestId("marks-attachment").textContent).toContain(
      "2 capital/lowercase pairs",
    );
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    // The gate is ON, so counterpart expansion attached the uppercase bases
    // automatically — they are NOT blocked combinations.
    const blocked = result.marksWorklist?.blockedCombinations ?? [];
    expect(blocked).not.toContainEqual({ base: "E", mark: ACUTE });
    expect(blocked).not.toContainEqual({ base: "A", mark: ACUTE });
  });

  it("spec 048 FR-006 sibling: no 'casing' facet entry at all (undetermined, baseIr present) gates OFF the fold — identical to caseless", () => {
    // baseIr is present but its `facets` map carries no "casing" key at all
    // (e.g. a fresh IR that never ran deriveFacets). getEffectiveFacet falls
    // through override -> derived -> "undetermined", so .value is undefined,
    // neither "cased" nor "mixed" — isCasedBase must read false, same as caseless.
    useWorkingCopyStore.setState({
      baseIr: { ...makeTestIR([]), facets: {} },
    });
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E", "a", "A"],
        marks: [ACUTE],
        attestedStacks: [
          { base: "e", marks: [ACUTE] },
          { base: "a", marks: [ACUTE] },
        ],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByLabelText(/^E can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^A can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
    expect(screen.getByTestId("marks-attachment").textContent).not.toContain(
      "capital/lowercase pair",
    );
  });

  it("spec 048 FR-006 sibling: baseIr === null (undetermined, no base at all) gates OFF the fold — identical to caseless", () => {
    // No instantiated base keyboard yet (baseIr stays at its reset() default
    // of null) — isCasedBase's `baseIr != null && ...` short-circuits to
    // false, so the fold must not run even though the bases below ARE a
    // Unicode case pair.
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E", "a", "A"],
        marks: [ACUTE],
        attestedStacks: [
          { base: "e", marks: [ACUTE] },
          { base: "a", marks: [ACUTE] },
        ],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByLabelText(/^E can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^A can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
    expect(screen.getByTestId("marks-attachment").textContent).not.toContain(
      "capital/lowercase pair",
    );
  });

  it("US1/SC-003: a caseless base's choice set is identical to the unfolded bases", () => {
    const KA = "क";
    const NUKTA = "़";
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: [KA],
        marks: [NUKTA],
        attestedStacks: [{ base: KA, marks: [NUKTA] }],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByLabelText(new RegExp(`^${KA} can carry`))).toBeTruthy();
  });

  it("US1/SC-004: the case-pair note reflects the lowercase-fold count", () => {
    seedCasedAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    // e and a each have a present uppercase counterpart → 2 pairs.
    expect(screen.getByTestId("marks-attachment").textContent).toContain(
      "2 capital/lowercase pairs",
    );
  });

  it("a mark attested ONLY on the uppercase base still names that base in the confirmed summary", () => {
    // Regression: the auto-confirmed summary derives its confirmed-base list
    // from the checked map's own keys, not the folded (lowercase-only) display
    // list. With acute attested only on "E" (never on "e"), "E" is folded out
    // of the offered choices but must still appear as the confirmed base — a
    // blank "confirmed on" summary would misrepresent what is attached.
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["e", "E"],
        marks: [ACUTE],
        attestedStacks: [{ base: "E", marks: [ACUTE] }],
        declaredRoles: {},
      },
    });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    const row = screen.getByTestId("attachment-row-U+0301");
    expect(row.tagName.toLowerCase()).toBe("details"); // auto-confirmed
    expect(row.textContent).toContain("confirmed on");
    // The confirmed grapheme is the accented capital, not a blank.
    expect(row.querySelector("strong")?.textContent).toBe(("E" + ACUTE).normalize("NFC"));
  });

  it("US2/SC-002: attaching a mark to lowercase bases still produces the uppercase counterparts in the worklist", () => {
    seedCasedAlphabet();
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    // Walk to completion (attested e/a acute stay checked).
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    const units = result.marksWorklist?.ownLetterUnits ?? [];
    // Accented capitals are produced without a second question.
    expect(units).toContain(("E" + ACUTE).normalize("NFC"));
    expect(units).toContain(("A" + ACUTE).normalize("NFC"));
    // The uppercase base×mark pairs are NOT blocked.
    const blocked = result.marksWorklist?.blockedCombinations ?? [];
    expect(blocked).not.toContainEqual({ base: "E", mark: ACUTE });
    expect(blocked).not.toContainEqual({ base: "A", mark: ACUTE });
  });
});

// ---------------------------------------------------------------------------
// S4 output-form station (US3, FR-013..FR-017; SC-005)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 output-form station", () => {
  const SCHWA = "ə"; // no ready-made accented forms exist

  function reachOutputForm(): void {
    fireEvent.click(screen.getByTestId("marks-continue")); // past S1
  }

  it("proposes base-plus-mark as a notice when a pair never composes (FR-014, US3 AC1)", () => {
    seedAlphabet([ACUTE], [SCHWA]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    const station = screen.getByTestId("marks-output-form");
    expect(station.textContent).toContain("letter plus its mark");
    // A notice, not an open question: no radio inputs.
    expect(station.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it("proposes ready-made as a notice when every pair composes (FR-015, US2 AC2)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    expect(screen.getByTestId("marks-output-form").textContent).toContain("ready-made");
  });

  it("shows the mandatory step-by-step backspace preview (FR-017)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    expect(screen.getByTestId("backspace-preview")).toBeTruthy();
  });

  it("offers a way to change the proposed form (propose-then-confirm)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    fireEvent.click(screen.getByTestId("output-form-change"));
    expect(screen.getByTestId("marks-output-form").textContent).toContain(
      "A letter and a mark, kept separate",
    );
  });

  it("after an override, the explanation describes the CHOSEN form, not the proposed one", () => {
    // Regression: the notice rendered `formLabel[value]` above
    // `proposal.explanation`, which is computed once from the policy and never
    // recomputed — so one click left the screen stating base-plus-mark above
    // the ready-made explanation.
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    // Before the override: ready-made, with the ready-made explanation.
    expect(screen.getByTestId("marks-output-form").textContent).toContain(
      "Backspace removes a whole accented letter in one step",
    );

    fireEvent.click(screen.getByTestId("output-form-change"));
    const text = screen.getByTestId("marks-output-form").textContent ?? "";
    // The chosen form and the paragraph under it agree...
    expect(text).toContain("A letter and a mark, kept separate");
    expect(text).toContain("Backspace clears the mark first and the plain letter next");
    // ...and the explanation of the form we just left is gone.
    expect(text).not.toContain("Backspace removes a whole accented letter in one step");
  });

  it("hides the override when no ready-made form exists for some pair (row 1)", () => {
    seedAlphabet([ACUTE], [SCHWA]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    expect(screen.queryByTestId("output-form-change")).toBeNull();
    expect(screen.getByTestId("output-form-change-unavailable").textContent).toContain(
      "no single-character form",
    );
  });

  it("states the S2 outcome as a premise (no own-key mark)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachOutputForm();
    expect(screen.getByTestId("output-form-premise").textContent).toContain(
      "no mark has a key of its own",
    );
  });

  it("SC-005: the station never renders the words Unicode or normalization", () => {
    for (const bases of [["e"], [SCHWA]]) {
      cleanup();
      useWorkingCopyStore.getState().reset();
      seedAlphabet([ACUTE], bases);
      act(() => {
        render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
      });
      reachOutputForm();
      const text = screen.getByTestId("marks-output-form").textContent ?? "";
      expect(text).not.toMatch(/unicode/i);
      expect(text).not.toMatch(/normali[sz]/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Full-series walk → PlacementWorklist handoff (US7, FR-020)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — worklist handoff (US7)", () => {
  const GRAVE = "̀";

  function seedTonalAlphabet(): void {
    // Acute + grave attested across three vowels → one productive above-marks
    // class (spread >= 3 → own-key prefill), S2 and S5 both render.
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: ["a", "e", "i", "k"],
        marks: [ACUTE, GRAVE],
        attestedStacks: [
          { base: "a", marks: [ACUTE] },
          { base: "e", marks: [ACUTE] },
          { base: "i", marks: [ACUTE] },
          { base: "a", marks: [GRAVE] },
          { base: "e", marks: [GRAVE] },
        ],
        declaredRoles: {},
      },
    });
  }

  function continueUntilComplete(onComplete: ReturnType<typeof vi.fn>): number {
    let screens = 0;
    while (onComplete.mock.calls.length === 0 && screens < 10) {
      screens++;
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    return screens;
  }

  it("walks S1..S5 and hands over markUnits + blocked combinations", () => {
    seedTonalAlphabet();
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    // S1 renders first; the series completes within the four-station budget
    // (spec 052 SC-003 supersedes spec 071's five-screen SC-006).
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    const screens = continueUntilComplete(onComplete);
    expect(screens).toBeLessThanOrEqual(4);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    const worklist = result.marksWorklist;
    // Productive class → both marks are mark units with an input order.
    expect(worklist?.markUnits.map((u) => u.mark).sort()).toEqual([ACUTE, GRAVE].sort());
    expect(worklist?.markUnits.every((u) => u.inputOrder === "prefix" || u.inputOrder === "postfix")).toBe(true);
    // k was never attested/checked for either mark → blocked both ways.
    expect(worklist?.blockedCombinations).toContainEqual({ base: "k", mark: ACUTE });
    expect(worklist?.blockedCombinations).toContainEqual({ base: "k", mark: GRAVE });
    // Every plain base keeps a whole-unit entry.
    for (const b of ["a", "e", "i", "k"]) {
      expect(worklist?.ownLetterUnits).toContain(b);
    }
  });

  it("renders S2 (treatment, with the order question folded in) and S5 (stacking) along the tonal walk", () => {
    seedTonalAlphabet();
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    const seen = new Set<string>();
    let sawFoldedOrder = false;
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      for (const id of [
        "marks-attachment",
        "marks-treatment",
        "marks-output-form",
        "marks-stacking",
      ]) {
        if (screen.queryByTestId(id) !== null) seen.add(id);
      }
      // The retired S3 station's question now lives INSIDE the treatment station.
      if (screen.queryByTestId("marks-treatment") !== null) {
        expect(
          screen.getByTestId("marks-treatment").querySelector('[data-testid="input-order"]'),
        ).not.toBeNull();
        sawFoldedOrder = true;
      }
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(seen.has("marks-treatment")).toBe(true);
    expect(sawFoldedOrder).toBe(true);
    expect(seen.has("marks-stacking")).toBe(true); // overlap evidence (FR-018)
    // FR-018/SC-003: the retired standalone station is gone for good.
    expect(screen.queryByTestId("marks-input-order")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S2 treatment station (spec 052 US1)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S2 treatment station (spec 052 US1)", () => {
  const GRAVE = "̀";
  const NUKTA = "़";
  const FATHA = "َ";
  const HIRIQ = "ִ";

  /** The fixture matrix SC-004 is measured over: five writing systems. */
  const SCRIPT_MATRIX: { name: string; bases: string[]; marks: string[] }[] = [
    { name: "Latin cased", bases: ["a", "A", "e", "E", "i", "I"], marks: [ACUTE, GRAVE] },
    { name: "Devanagari dependent vowel sign", bases: ["क", "ख", "ग"], marks: [NUKTA, "ा"] },
    { name: "Arabic haraka", bases: ["ب", "ت", "ث"], marks: [FATHA, "ِ"] },
    { name: "Hebrew niqqud", bases: ["א", "ב", "ג"], marks: [HIRIQ, "ַ"] },
    { name: "caseless (Ethiopic-style)", bases: ["ሀ", "ለ", "ሐ"], marks: [ACUTE, GRAVE] },
  ];

  function seedMatrixEntry(entry: { bases: string[]; marks: string[] }): void {
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      alphabet: {
        bases: entry.bases,
        marks: entry.marks,
        // Attest every mark on the first three bases so the class is productive
        // and the treatment station has a genuine decision to render.
        attestedStacks: entry.marks.flatMap((m) =>
          entry.bases.slice(0, 3).map((b) => ({ base: b, marks: [m] })),
        ),
        declaredRoles: {},
      },
    });
  }

  /** One productive above-marks class (spread >= 3) — marks earn their own keys. */
  function seedTonalAlphabetForAxes(): void {
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

  function reachTreatment(): HTMLElement | null {
    for (let i = 0; i < 6 && screen.queryByTestId("marks-treatment") === null; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    return screen.queryByTestId("marks-treatment");
  }

  it("FR-007/SC-004/US1 AC4: no designer-facing text presupposes alphabetic writing", () => {
    for (const entry of SCRIPT_MATRIX) {
      cleanup();
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      seedMatrixEntry(entry);
      act(() => {
        render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
      });
      const station = reachTreatment();
      expect(station, `${entry.name}: treatment station never rendered`).not.toBeNull();
      const text = station?.textContent ?? "";
      expect(text, entry.name).not.toMatch(/letter of the alphabet/i);
      expect(text, entry.name).not.toMatch(/its own letter/i);
      expect(text, entry.name).not.toMatch(/alphabet/i);
    }
  });

  it("FR-008/SC-004: no production jargon in the station", () => {
    for (const entry of SCRIPT_MATRIX) {
      cleanup();
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      seedMatrixEntry(entry);
      act(() => {
        render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
      });
      const text = reachTreatment()?.textContent ?? "";
      expect(text, entry.name).not.toMatch(/dead ?key/i);
      expect(text, entry.name).not.toMatch(/unicode/i);
      expect(text, entry.name).not.toMatch(/normali[sz]/i);
      expect(text, entry.name).not.toMatch(/codepoint/i);
      expect(text, entry.name).not.toMatch(/precomposed/i);
    }
  });

  it("FR-018/SC-003: the series renders at most FOUR stations", () => {
    seedMatrixEntry(SCRIPT_MATRIX[0] ?? { bases: ["a"], marks: [ACUTE] });
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    let screens = 0;
    while (onComplete.mock.calls.length === 0 && screens < 10) {
      screens++;
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(screens).toBeLessThanOrEqual(4);
  });

  it("SC-002: a fully-attested single-mark orthography still confirms in at most TWO screens", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    let screens = 0;
    while (onComplete.mock.calls.length === 0 && screens < 10) {
      screens++;
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(screens).toBeLessThanOrEqual(2);
  });

  it("US1 AC5: an empty marks store skips the series entirely", () => {
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("marks-treatment")).toBeNull();
    expect(screen.queryByTestId("marks-series")).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("FR-019/US1 AC6: a class with nothing to decide renders no screen and takes treatment, promotion AND order from the proposal", () => {
    // One mark, one reachable base — nothing to decide at S2.
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      expect(screen.queryByTestId("marks-treatment")).toBeNull();
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    const worklist = result.marksWorklist;
    // The proposal (narrow spread, no combining base) recommends `composed`,
    // so é arrives as a whole unit with no screen shown, and the order answer
    // still reached the worklist (no mark unit here, so it is inert but recorded).
    expect(worklist?.ownLetterUnits).toContain("é");
    expect(worklist?.markUnits).toEqual([]);
  });

  it("US4/FR-027: the phase result carries computedAxes so strategy selection can see the answer", () => {
    // The omission of this field WAS the defect: the marks series produced the
    // richest statement the survey has about mark behaviour and sent none of it
    // to selectStrategy.
    seedTonalAlphabetForAxes();
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.computedAxes).toBeDefined();
    // A productive above-marks class → the marks earn their own keys, one family.
    expect(result.computedAxes?.diacriticBehavior).toBe("stacking-combining");
    expect(["prefix", "postfix"]).toContain(result.computedAxes?.markInputOrder);
  });

  it("spec 079 supersedes FR-020's old 'returns to the first station': an alphabet edit re-proposes affected answers but does NOT move the author off their current station", () => {
    // Old (pre-079) behaviour: any alphabet edit reset `stationIndex` to 0.
    // Spec 079 removes that reset entirely (FR-004/FR-023 generalised,
    // amendment to spec 071/spec 052) — navigation, including a re-proposal,
    // never undoes the author's position. The station-count/content change
    // this edit provokes is still real (evidence keys move, so affected
    // answers reconcile to `reproposed` — flag UI itself is a later task),
    // but the AUTHOR stays exactly where they were.
    seedMatrixEntry(SCRIPT_MATRIX[0] ?? { bases: ["a"], marks: [ACUTE] });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    // Walk past S1 onto the treatment station.
    expect(reachTreatment()).not.toBeNull();
    expect(screen.queryByTestId("marks-attachment")).toBeNull();
    // Edit the confirmed alphabet: a new mark changes the evidence.
    act(() => {
      useWorkingCopyStore.getState().recordPhase({
        phase: "B",
        answers: [],
        alphabet: {
          bases: ["a", "A", "e", "E", "i", "I", "o"],
          marks: [ACUTE, GRAVE, "̂"],
          attestedStacks: [
            { base: "a", marks: [ACUTE] },
            { base: "e", marks: [ACUTE] },
            { base: "i", marks: [ACUTE] },
            { base: "a", marks: [GRAVE] },
            { base: "o", marks: ["̂"] },
          ],
          declaredRoles: {},
        },
      });
    });
    // Still on the treatment station — the edit did not move the author.
    expect(screen.getByTestId("marks-treatment")).toBeTruthy();
    expect(screen.queryByTestId("marks-attachment")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S4 open choice (US4, FR-016)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 open choice (US4)", () => {
  const GRAVE = "̀";
  const SCHWA_BASE = "ə"; // no ready-made accented forms exist

  function seedComposableProductiveAlphabet(): void {
    // Every pair composes (a/e/i with acute+grave all have ready-made forms)
    // and the wide spread makes the class letter-plus-mark → FR-016 open case.
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

  it("renders as an OPEN choice with the recommended option first and previews for both (US4 AC1+AC2)", () => {
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");
    const station = screen.getByTestId("marks-output-form");
    const radios = station.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(2);
    // Recommended (base-plus-mark for a productive class) listed first + tagged.
    expect(station.textContent).toContain("recommended");
    const labels = station.querySelectorAll("label");
    expect(labels[0]?.textContent).toContain("A letter and a mark, kept separate");
    // Both options carry a backspace preview.
    expect(station.querySelectorAll('[data-testid="backspace-preview"]')).toHaveLength(2);
    // SC-005 holds on the open-choice rendering too.
    expect(station.textContent).not.toMatch(/unicode/i);
    expect(station.textContent).not.toMatch(/normali[sz]/i);
  });

  it("names the own-key marks from S2 as a premise, and keeps the override (row 2)", () => {
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");
    const premise = screen.getByTestId("output-form-premise").textContent ?? "";
    expect(premise).toContain("marks with a key of their own");
    expect(premise).toContain(ACUTE);
  });

  it("drops a ready-made override when an alphabet edit makes it unrealisable (row 2 → row 1)", () => {
    // The re-seed effect keyed on `outputFormProposal.form` cannot catch this:
    // row 2 and row 1 BOTH propose base-plus-mark, so the proposed form does
    // not change and a `ready-made` override taken on the open choice would
    // survive onto a row-1 notice — an answer the keyboard cannot produce, on
    // a screen that no longer offers the button to undo it.
    seedComposableProductiveAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    reachStation("marks-output-form");

    // Override the open choice to ready-made (the non-recommended option).
    const readyMade = screen.getByLabelText(/One unit per accented letter/) as HTMLInputElement;
    fireEvent.click(readyMade);
    expect(
      (screen.getByLabelText(/One unit per accented letter/) as HTMLInputElement).checked,
    ).toBe(true);

    // Edit the alphabet: schwa + acute has no ready-made form, so the posture
    // table now trips row 1 (which still proposes base-plus-mark).
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
    // FR-023 sends the author back to the first station — walk forward again.
    reachStation("marks-output-form");

    const station = screen.getByTestId("marks-output-form");
    // A row-1 notice, not the open choice, and the override is gone...
    expect(station.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(screen.queryByTestId("output-form-change")).toBeNull();
    // ...and the answer reset to base-plus-mark rather than keeping the now
    // unrealisable ready-made.
    expect(station.textContent).toContain("A letter and a mark, kept separate");
    expect(station.textContent).not.toContain("One unit per accented letter");
  });
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
        <MarksSeriesStep onComplete={onComplete} />
      </QuestionRecorderContext.Provider>,
      { withStepNav: true },
    );
    return recorder;
  }

  it("T023: un-ticking attachments, changing treatment/order and stacking survive an unmount/remount with the SAME alphabet, at the same position", () => {
    seedFixture();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
    ]);

    // S5 (final) Next — completes the step. The recorder is NOT called again
    // here: the final station's answers ride step completion (R-05), not a
    // direct `recordQuestionAnswers` call.
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(recorder).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    // The completion result carries EVERY station's answers (R-04), including
    // the stacking answers this final Next itself resolved.
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_attachment");
  });

  it("a saved station that is no longer visible is replaced in the store by the station rendered", () => {
    seedFixture();
    useSurveyAnswerStore.getState().setPosition("marks", "marks_no_longer_visible");
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_attachment");
  });

  it("T083: a position parked via setPosition before mount (what jumpToLocation does) lands on that station with its saved answers", () => {
    seedFixture();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByTestId("marks-continue")); // -> treatment
    fireEvent.click(screen.getByTestId("treatment-option-above-1-composed"));
    cleanup();

    useSurveyAnswerStore.getState().setPosition("marks", "marks_treatment");
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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

// ---------------------------------------------------------------------------
// spec 079 US3 — targeted re-proposal, flags, gate (T045, T046, T058, T082)
// ---------------------------------------------------------------------------

function seedFullAlphabet(alphabet: ConfirmedAlphabet): void {
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet });
}

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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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

  it("explicit input order survives an unrelated evidence change while still applicable (FR-012)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
    expect((screen.getByTestId("marks-continue") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a flagged answer shows its catalog reason", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("flagged-answers-list").textContent).toMatch(/you added/i);
  });

  it("confirming a station re-stamps its answers' evidence key, clearing the flag (FR-041)", () => {
    seedFullAlphabet(TWO_BASE_ALPHABET);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    const answer = useSurveyAnswerStore.getState().steps.marks?.answers["marks_attachment.́|b"];
    expect(answer?.stage).toBe("confirmed");
    cleanup();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });

  it("removing the last diacritic keeps the saved answers and shows no work-to-do; restoring it renders them unflagged (T082, data-model.md §3 inactive/kept)", () => {
    seedFullAlphabet({ bases: ["e"], marks: [ACUTE], attestedStacks: [{ base: "e", marks: [ACUTE] }], declaredRoles: {} });
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />, { withStepNav: true });
    });
    // Walk to completion so every station's answers are saved.
    while (!onComplete.mock.calls.length) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    const savedBefore = useSurveyAnswerStore.getState().steps.marks?.answers ?? {};
    expect(Object.keys(savedBefore).length).toBeGreaterThan(0);
    cleanup();

    // Remove the last diacritic entirely — the series gate now skips.
    seedFullAlphabet({ bases: ["e"], marks: [], attestedStacks: [], declaredRoles: {} });
    const onCompleteAfterRemoval = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onCompleteAfterRemoval} />, { withStepNav: true });
    });
    expect(onCompleteAfterRemoval).toHaveBeenCalledTimes(1);
    // Answers are KEPT in the store, not cleared.
    expect(useSurveyAnswerStore.getState().steps.marks?.answers).toEqual(savedBefore);
    cleanup();

    // Restore the diacritic: every original answer renders unflagged again.
    seedFullAlphabet({ bases: ["e"], marks: [ACUTE], attestedStacks: [{ base: "e", marks: [ACUTE] }], declaredRoles: {} });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });
});
