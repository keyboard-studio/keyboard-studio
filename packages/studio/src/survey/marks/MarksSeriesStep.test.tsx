// MarksSeriesStep — S0 gate behavior (spec 046 US1).
//
// The gate never renders: a marks-free alphabet completes the step immediately
// with an EMPTY worklist on forward entry, and keeps popping backward on a
// back-nav entry (transparent in both directions). A marked alphabet renders
// the series shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
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
    // class (spread >= 3 → letter-plus-mark prefill), S2/S3/S5 all render.
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
    // S1 renders first; the series completes within the five-station budget.
    expect(screen.getByTestId("marks-attachment")).toBeTruthy();
    const screens = continueUntilComplete(onComplete);
    expect(screens).toBeLessThanOrEqual(5); // SC-006
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

  it("renders S2 (mental model), S3 (input order), S5 (stacking) along the tonal walk", () => {
    seedTonalAlphabet();
    const onComplete = vi.fn();
    act(() => {
      render(<MarksSeriesStep onComplete={onComplete} />);
    });
    const seen = new Set<string>();
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      for (const id of [
        "marks-attachment",
        "marks-mental-model",
        "marks-input-order",
        "marks-output-form",
        "marks-stacking",
      ]) {
        if (screen.queryByTestId(id) !== null) seen.add(id);
      }
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(seen.has("marks-mental-model")).toBe(true);
    expect(seen.has("marks-input-order")).toBe(true);
    expect(seen.has("marks-stacking")).toBe(true); // overlap evidence (FR-018)
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
