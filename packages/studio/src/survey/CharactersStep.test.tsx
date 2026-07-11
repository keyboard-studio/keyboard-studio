// CharactersStep unit tests (spec 027 SC-001).
//
// Covers:
//   (a) prefill -> confirm -> PhaseB -> complete emits SurveyPhaseResult via onComplete
//   (b) PhaseB -> back returns to prefill; does NOT fire props.onBack
//   (c) prefill -> back calls props.onBack
//   (d) with store slot pre-set to "B", component mounts directly at PhaseB
//       (carve-back re-entry proof)
//   (e) findings derived from seeded validatorFindings equal buildFindingsByQuestionId
//       of the same input
//
// Strategy: mock Prefill and PhaseB at the survey/index level (shallow stubs that
// record callbacks and render unique testids). Seed stores via getState()/setState.
// Reset both stores between cases.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";

// ---------------------------------------------------------------------------
// Hoisted refs for mock callbacks
// ---------------------------------------------------------------------------

const { mockPrefillConfirmRef, mockPrefillBackRef, mockPhaseBCompleteRef, mockPhaseBBackRef, mockPhaseBFindingsRef } =
  vi.hoisted(() => ({
    mockPrefillConfirmRef: { current: null as null | (() => void) },
    mockPrefillBackRef: { current: null as null | (() => void) },
    mockPhaseBCompleteRef: { current: null as null | ((r: unknown) => void) },
    mockPhaseBBackRef: { current: null as null | (() => void) },
    // Captures the findingsByQuestionId prop PhaseB receives on each render.
    mockPhaseBFindingsRef: { current: undefined as Record<string, unknown[]> | undefined },
  }));

// ---------------------------------------------------------------------------
// Mock survey/index.ts — shallow stubs for Prefill and PhaseB
// ---------------------------------------------------------------------------

vi.mock("./index.ts", () => ({
  Prefill: ({
    onConfirm,
    onBack,
  }: {
    onConfirm: () => void;
    onBack?: () => void;
  }) => {
    mockPrefillConfirmRef.current = onConfirm;
    mockPrefillBackRef.current = onBack ?? null;
    return (
      <div data-testid="mock-prefill">
        <button type="button" data-testid="prefill-confirm" onClick={onConfirm}>
          confirm
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="prefill-back" onClick={onBack}>
            back
          </button>
        )}
      </div>
    );
  },
  PhaseB: ({
    onComplete,
    onBack,
    findingsByQuestionId,
  }: {
    onComplete: (r: unknown) => void;
    onBack?: () => void;
    findingsByQuestionId?: Record<string, unknown[]>;
  }) => {
    mockPhaseBCompleteRef.current = onComplete;
    mockPhaseBBackRef.current = onBack ?? null;
    mockPhaseBFindingsRef.current = findingsByQuestionId;
    const fakeResult: SurveyPhaseResult = {
      phase: "B" as const,
      answers: [],
      confirmedInventory: [],
    };
    return (
      <div data-testid="mock-phase-b">
        <button
          type="button"
          data-testid="phaseB-complete"
          onClick={() => onComplete(fakeResult)}
        >
          complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="phaseB-back" onClick={onBack}>
            back
          </button>
        )}
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { CharactersStep } from "./CharactersStep.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeIdentity = {
  autonym: "Test Language",
  english: "Test Language",
  languageSubtag: "tl",
  targetScriptRaw: "Latn",
  bcp47: "tl-Latn",
  supported: true,
  prefill: {
    script: "Latn",
    scriptClass: "alphabetic" as const,
    routingGroup: "qwerty-qwertz",
  },
};

const fakeBase = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"] as string[],
  version: "1.0",
};

/** Seed surveySessionStore with identity + base so prefill guard passes. */
function seedSessionStore() {
  useSurveySessionStore.setState({
    identityResult: fakeIdentity,
    localBase: fakeBase,
    surveyContext: { language_name: "Test Language", routing_group: "qwerty-qwertz", script_family: "Latn" },
    charactersSubStage: "prefill",
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  mockPrefillConfirmRef.current = null;
  mockPrefillBackRef.current = null;
  mockPhaseBCompleteRef.current = null;
  mockPhaseBBackRef.current = null;
  mockPhaseBFindingsRef.current = undefined;
});

// ---------------------------------------------------------------------------
// (a) prefill -> confirm -> PhaseB -> complete emits SurveyPhaseResult
// ---------------------------------------------------------------------------

describe("CharactersStep — prefill -> PhaseB -> complete", () => {
  it("renders Prefill at substage 'prefill', then PhaseB after confirm, then emits result on complete", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStep onComplete={onComplete} onBack={onBack} />);

    // Initial render shows Prefill
    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(screen.queryByTestId("mock-phase-b")).toBeNull();

    // Confirm transitions to PhaseB
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    expect(screen.queryByTestId("mock-prefill")).toBeNull();
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();

    // PhaseB complete emits result via onComplete; props.onBack not called
    fireEvent.click(screen.getByTestId("phaseB-complete"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const emitted = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(emitted).toBeDefined();
    expect(emitted.phase).toBe("B");
    expect(onBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) PhaseB -> back returns to prefill; does NOT fire props.onBack
// ---------------------------------------------------------------------------

describe("CharactersStep — PhaseB back returns to prefill", () => {
  it("returns to Prefill when PhaseB onBack is called, without calling props.onBack", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStep onComplete={onComplete} onBack={onBack} />);

    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-back"));

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(screen.queryByTestId("mock-phase-b")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) prefill -> back calls props.onBack
// ---------------------------------------------------------------------------

describe("CharactersStep — prefill back calls props.onBack", () => {
  it("calls props.onBack when Prefill onBack is triggered", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStep onComplete={onComplete} onBack={onBack} />);

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    fireEvent.click(screen.getByTestId("prefill-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (d) store slot pre-set to "B" mounts directly at PhaseB (carve-back re-entry)
// ---------------------------------------------------------------------------

describe("CharactersStep — carve-back re-entry at PhaseB", () => {
  it("mounts directly at PhaseB when store slot is pre-set to 'B'", () => {
    seedSessionStore();
    // Simulate carve-back: the store slot was already "B" before remount
    useSurveySessionStore.setState({ charactersSubStage: "B" });

    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStep onComplete={onComplete} onBack={onBack} />);

    // Must open directly at PhaseB, not Prefill
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(screen.queryByTestId("mock-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (e) PhaseB receives findingsByQuestionId derived from seeded validatorFindings
// ---------------------------------------------------------------------------

describe("CharactersStep — findingsByQuestionId prop passed to PhaseB", () => {
  it("passes findingsByQuestionId derived from workingCopyStore.validatorFindings to PhaseB", () => {
    seedSessionStore();
    // Mount directly at stage B so PhaseB renders immediately.
    useSurveySessionStore.setState({ charactersSubStage: "B" });

    // Seed a known finding into workingCopyStore.
    const fakeFindings: LintFinding[] = [
      {
        code: "KM_LINT_INVENTORY_UNCOVERED",
        severity: "warning",
        message: "test finding",
        source: "test",
      },
    ];
    useWorkingCopyStore.setState({ validatorFindings: fakeFindings });

    render(<CharactersStep onComplete={vi.fn()} onBack={vi.fn()} />);

    // PhaseB must have received findingsByQuestionId.
    expect(mockPhaseBFindingsRef.current).toBeDefined();

    // The captured prop must deep-equal the pure helper's output for the same input.
    const expected = buildFindingsByQuestionId(fakeFindings);
    expect(mockPhaseBFindingsRef.current).toEqual(expected);
  });
});
