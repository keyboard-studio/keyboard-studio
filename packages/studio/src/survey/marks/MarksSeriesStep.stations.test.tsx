// MarksSeriesStep gate, S0 skip, series shell, Back gating, S1 attachment and lowercase-only base choices.
// Split from the former single MarksSeriesStep.test.tsx; see MarksSeriesStep.testkit.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { computeMarksGate } from "./MarksSeriesStep.tsx";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { ACUTE, seedAlphabet } from "./MarksSeriesStep.testkit.ts";

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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} onBack={onBack} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("first station + onBack: Back is visible and calls onBack", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onBack = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} onBack={onBack} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    const station = screen.getByTestId("marks-attachment");
    expect(station).toBeTruthy();
    const checkbox = screen.getByLabelText(/e can carry/) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders a single-attested-base mark as an auto-confirmed summary (FR-008)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    const row = screen.getByTestId("attachment-row-U+0301");
    expect(row.tagName.toLowerCase()).toBe("details");
    expect(row.textContent).toContain("confirmed on");
  });

  it("states the unchecked-means-blocked consequence in the row help text (FR-007)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByTestId("marks-attachment").textContent).toContain(
      "will not take this mark",
    );
  });

  it("simple orthography completes in at most TWO marks screens (SC-002); there is no guard question", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    // Screen 1: the auto-confirmed attachment summary.
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));
    // Screen 2: the output-form notice — the last screen, since the one
    // mark is composed (#2374 removed the guard question entirely).
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
    // fixture must carry a derived-cased `startIr`, matching what a real
    // Latin-base instantiation would populate.
    useWorkingCopyStore.setState({
      startIr: { ...makeTestIR([]), facets: { casing: { value: "cased", provenance: "derived" } } },
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      startIr: { ...makeTestIR([]), facets: { casing: { value: "caseless", provenance: "derived" } } },
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      startIr: { ...makeTestIR([]), facets: { casing: { value: "mixed", provenance: "derived" } } },
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
    // startIr is present but its `facets` map carries no "casing" key at all
    // (e.g. a fresh IR that never ran deriveFacets). getEffectiveFacet falls
    // through override -> derived -> "undetermined", so .value is undefined,
    // neither "cased" nor "mixed" — isCasedBase must read false, same as caseless.
    useWorkingCopyStore.setState({
      startIr: { ...makeTestIR([]), facets: {} },
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
    // No instantiated base keyboard yet (startIr stays at its reset() default
    // of null) — isCasedBase's `startIr != null && ...` short-circuits to
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
    });
    expect(screen.getByLabelText(new RegExp(`^${KA} can carry`))).toBeTruthy();
  });

  it("US1/SC-004: the case-pair note reflects the lowercase-fold count", () => {
    seedCasedAlphabet();
    act(() => {
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
