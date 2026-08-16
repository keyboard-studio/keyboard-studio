// MarksSeriesStep — S0 gate behavior (spec 071 US1).
//
// The gate never renders: a marks-free alphabet completes the step immediately
// with an EMPTY worklist on forward entry, and keeps popping backward on a
// back-nav entry (transparent in both directions). A marked alphabet renders
// the series shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { MarksSeriesStep, computeMarksGate } from "./MarksSeriesStep.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";

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

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} onBack={onBack} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("first station + onBack: Back is visible and calls onBack", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onBack = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} onBack={onBack} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    const station = screen.getByTestId("marks-attachment");
    expect(station).toBeTruthy();
    const checkbox = screen.getByLabelText(/e can carry/) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders a single-attested-base mark as an auto-confirmed summary (FR-008)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    const row = screen.getByTestId("attachment-row-U+0301");
    expect(row.tagName.toLowerCase()).toBe("details");
    expect(row.textContent).toContain("confirmed on");
  });

  it("states the unchecked-means-blocked consequence in the row help text (FR-007)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    expect(screen.getByTestId("marks-attachment").textContent).toContain(
      "will not take this mark",
    );
  });

  it("simple orthography completes in at most TWO marks screens (SC-002)", () => {
    seedAlphabet([ACUTE], ["e"]);
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    // The row exposes one checkbox per offered base via its aria-label
    // "<base> can carry ...". Uppercase E / A must not appear as choices.
    expect(screen.queryByLabelText(/^E can carry/)).toBeNull();
    expect(screen.queryByLabelText(/^A can carry/)).toBeNull();
    // Lowercase counterparts remain offered.
    expect(screen.getByLabelText(/^e can carry/)).toBeTruthy();
    expect(screen.getByLabelText(/^a can carry/)).toBeTruthy();
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    expect(screen.getByLabelText(new RegExp(`^${KA} can carry`))).toBeTruthy();
  });

  it("US1/SC-004: the case-pair note reflects the lowercase-fold count", () => {
    seedCasedAlphabet();
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    reachOutputForm();
    expect(screen.getByTestId("marks-output-form").textContent).toContain("ready-made");
  });

  it("shows the mandatory step-by-step backspace preview (FR-017)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    reachOutputForm();
    expect(screen.getByTestId("backspace-preview")).toBeTruthy();
  });

  it("offers a way to change the proposed form (propose-then-confirm)", () => {
    seedAlphabet([ACUTE], ["e"]);
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    reachOutputForm();
    fireEvent.click(screen.getByTestId("output-form-change"));
    expect(screen.getByTestId("marks-output-form").textContent).toContain(
      "Letter plus mark, built as you type",
    );
  });

  it("SC-005: the station never renders the words Unicode or normalization", () => {
    for (const bases of [["e"], [SCHWA]]) {
      cleanup();
      useWorkingCopyStore.getState().reset();
      seedAlphabet([ACUTE], bases);
      act(() => {
        render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
        render(<MarksSeriesStep onComplete={vi.fn()} />);
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
        render(<MarksSeriesStep onComplete={vi.fn()} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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
      render(<MarksSeriesStep onComplete={onComplete} />);
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

  it("FR-020/US1 AC7: an alphabet edit re-proposes and returns to the first station", () => {
    seedMatrixEntry(SCRIPT_MATRIX[0] ?? { bases: ["a"], marks: [ACUTE] });
    act(() => {
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    // Walk past S1 onto the treatment station.
    expect(reachTreatment()).not.toBeNull();
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
    // Back at the first station — the re-seeded decisions must be walked again.
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    expect(screen.queryByTestId("marks-treatment")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S4 open choice (US4, FR-016)
// ---------------------------------------------------------------------------

describe("MarksSeriesStep — S4 open choice (US4)", () => {
  const GRAVE = "̀";

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
      render(<MarksSeriesStep onComplete={vi.fn()} />);
    });
    reachStation("marks-output-form");
    const station = screen.getByTestId("marks-output-form");
    const radios = station.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(2);
    // Recommended (base-plus-mark for a productive class) listed first + tagged.
    expect(station.textContent).toContain("recommended");
    const labels = station.querySelectorAll("label");
    expect(labels[0]?.textContent).toContain("Letter plus mark");
    // Both options carry a backspace preview.
    expect(station.querySelectorAll('[data-testid="backspace-preview"]')).toHaveLength(2);
    // SC-005 holds on the open-choice rendering too.
    expect(station.textContent).not.toMatch(/unicode/i);
    expect(station.textContent).not.toMatch(/normali[sz]/i);
  });
});
