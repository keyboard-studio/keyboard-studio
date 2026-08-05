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

// ---------------------------------------------------------------------------
// (f) Spec 057 US1 / FR-007 (T021) — the Phase B draft alphabet is cleared by a
// genuine prefill → build-list transition, and by nothing else.
//
// D-4: composed with the mount reset (D-1), a tab round trip mid-characters
// returned `charactersSubStage` to "prefill"; re-confirming prefill then fired
// `resetPhaseBDraft()` and silently emptied the alphabet the author had built.
// The reset is gone, so the substage survives — and these tests pin the
// remaining half of the contract, which is that a REMOUNT at substage "B" must
// not clear the draft either.
// ---------------------------------------------------------------------------

import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";

describe("CharactersStep — Phase B draft alphabet lifecycle (spec 057 FR-007)", () => {
  /** Seed a built alphabet, as the author would have on the build-list screen. */
  function seedAlphabet(chars: string[]) {
    usePhaseBDraftStore.getState().reset();
    for (const c of chars) usePhaseBDraftStore.getState().add(c);
  }

  it("remounting at substage 'B' does NOT clear the draft alphabet", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedAlphabet(["é", "ŋ", "ɔ"]);

    // First mount, then a route-change-shaped unmount/remount.
    const first = render(<CharactersStep onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    first.unmount();
    render(<CharactersStep onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toEqual(["é", "ŋ", "ɔ"]);
  });

  it("a genuine prefill -> build-list confirm DOES clear it (the intended reset)", () => {
    seedSessionStore(); // substage "prefill"
    seedAlphabet(["é", "ŋ"]);

    render(<CharactersStep onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("mock-prefill")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-confirm"));

    // Entering the build-list screen from prefill starts a fresh alphabet —
    // this is by design and is NOT what D-4 was about.
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("stepping back to prefill and forward again clears it — the transition, not the mount, is the trigger", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedAlphabet(["é"]);

    render(<CharactersStep onComplete={vi.fn()} onBack={vi.fn()} />);
    // Back to prefill: still not a clear — the author has not re-confirmed yet,
    // so their alphabet is still recoverable by going forward without confirming.
    fireEvent.click(screen.getByTestId("phaseB-back"));
    expect(usePhaseBDraftStore.getState().chars).toEqual(["é"]);

    // Re-confirming prefill IS the transition, and clears.
    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });
});
