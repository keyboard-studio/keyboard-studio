// MarksSeriesStep worklist handoff and the S2 treatment station.
// Split from the former single MarksSeriesStep.test.tsx; see MarksSeriesStep.testkit.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { ACUTE, seedAlphabet } from "./MarksSeriesStep.testkit.ts";

afterEach(() => {
  cleanup();
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    // S1 renders first; the series completes within the station budget
    // (spec 052 SC-003's four).
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
        render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
        render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
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
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    for (let i = 0; i < 8 && onComplete.mock.calls.length === 0; i++) {
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
      render(<MarksStepHost onComplete={vi.fn()} />, { withStepNav: true });
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
