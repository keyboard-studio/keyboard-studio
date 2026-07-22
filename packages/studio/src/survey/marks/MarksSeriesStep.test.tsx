// MarksSeriesStep — S0 gate behavior (spec 046 US1).
//
// The gate never renders: a marks-free alphabet completes the step immediately
// with an EMPTY worklist on forward entry, and keeps popping backward on a
// back-nav entry (transparent in both directions). A marked alphabet renders
// the series shell.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
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
    // Simulate the Back press that landed here: last traversal move was a pop.
    act(() => {
      useSurveySessionStore.getState().advance("carve");
      useSurveySessionStore.getState().advance("marks");
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
