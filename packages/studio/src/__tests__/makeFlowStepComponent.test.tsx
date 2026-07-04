// makeFlowStepComponent factory unit test (spec 029 Stage 6, T012 / SC-006).
//
// Proves:
//   (a) resolve → run → extract → complete for the "track" flow ref (US3).
//   (b) stay-on-step when extract returns undefined.
//   (c) loud throw for an unknown flowRef (FR-010 / "no default is a defect").
//   (d) onCommit fires BEFORE onComplete (R7 ordering).
//
// The test mocks survey/index.ts so that FlowStepHost renders a controllable
// stub (matching the golden-walk pattern). Store deps are injected via
// vi.mock so the factory's useSurveySessionStore / useWorkingCopyStore selectors
// return deterministic values.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { EditorStepProps } from "../steps/types.ts";

// ---------------------------------------------------------------------------
// Hoisted refs for mock callbacks
// ---------------------------------------------------------------------------

const { mockFlowStepHostCompleteRef, mockFlowStepHostGetSeedValueRef, mockFlowStepHostOnAnswerCommitRef } = vi.hoisted(() => ({
  mockFlowStepHostCompleteRef: {
    current: null as null | ((result: unknown) => void),
  },
  mockFlowStepHostGetSeedValueRef: {
    current: null as null | ((questionId: string) => string | string[] | undefined),
  },
  mockFlowStepHostOnAnswerCommitRef: {
    current: null as null | ((questionId: string, value: string | string[] | undefined) => void),
  },
}));

// ---------------------------------------------------------------------------
// Mock survey/FlowStepHost.tsx — intercept FlowStepHost with a stub that
// captures the onComplete prop so tests can drive completion programmatically.
// The factory imports FlowStepHost from the direct file path (not index.ts),
// so we mock that file.
// ---------------------------------------------------------------------------

vi.mock("../survey/FlowStepHost.tsx", () => ({
  FlowStepHost: ({
    onComplete,
    title,
    getSeedValue,
    onAnswerCommit,
  }: {
    onComplete: (result: unknown) => void;
    title: string;
    getSeedValue?: (questionId: string) => string | string[] | undefined;
    onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  }) => {
    mockFlowStepHostCompleteRef.current = onComplete;
    mockFlowStepHostGetSeedValueRef.current = getSeedValue ?? null;
    mockFlowStepHostOnAnswerCommitRef.current = onAnswerCommit ?? null;
    return (
      <div data-testid="flow-step-host">
        <span data-testid="flow-step-title">{title}</span>
        <button
          type="button"
          data-testid="fsh-complete"
          onClick={() =>
            onComplete({
              phase: "G" as const,
              answers: [
                {
                  questionId: "track_choice",
                  answerType: "select" as const,
                  value: "copy",
                },
              ],
              confirmedInventory: [],
            })
          }
        >
          complete
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Mock stores — return deterministic values; spy on setSelectedTrack
// ---------------------------------------------------------------------------

const mockSetSelectedTrack = vi.fn();
const mockSetScaffoldSpec = vi.fn();
const mockSetIdentity = vi.fn();

vi.mock("../stores/surveySessionStore.ts", () => ({
  useSurveySessionStore: (selector: (s: unknown) => unknown) => {
    const store = {
      localBase: { displayName: "Test Base" },
      identityResult: { autonym: "Hausa", english: "Hausa" },
      surveyContext: {},
      setSelectedTrack: mockSetSelectedTrack,
      setScaffoldSpec: mockSetScaffoldSpec,
    };
    return selector(store);
  },
}));

vi.mock("../stores/workingCopyStore.ts", () => ({
  useWorkingCopyStore: (selector: (s: unknown) => unknown) => {
    const store = {
      validatorFindings: [],
      setIdentity: mockSetIdentity,
    };
    return selector(store);
  },
}));

vi.mock("../lint/lintToQuestion.ts", () => ({
  buildFindingsByQuestionId: () => ({}),
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock)
// ---------------------------------------------------------------------------

import { makeFlowStepComponent } from "../editors/adapters/makeFlowStepComponent.tsx";
import type { FlowStepOptions, FlowStepDeps } from "../editors/adapters/makeFlowStepComponent.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TrackPayload = { track: "copy" | "adapt" };

function buildTrackOptions(overrides?: Partial<FlowStepOptions<TrackPayload>>): FlowStepOptions<TrackPayload> {
  return {
    flowRef: "track",
    title: "Authoring Track",
    buildContext: () => ({ base_name: "Test Base" }),
    extract(result: SurveyPhaseResult): TrackPayload | undefined {
      const answer = result.answers.find((a) => a.questionId === "track_choice");
      const v =
        answer !== undefined &&
        (answer.answerType === "select" || answer.answerType === "text")
          ? String(answer.value)
          : undefined;
      if (v === "copy" || v === "adapt") return { track: v };
      return undefined;
    },
    onCommit(extracted, deps) {
      deps.setSelectedTrack(extracted.track);
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("makeFlowStepComponent", () => {
  describe("unknown flowRef — loud throw (FR-010)", () => {
    it("throws a descriptive Error at factory call time for an unknown flowRef", () => {
      expect(() =>
        makeFlowStepComponent({
          flowRef: "nonexistent_flow_xyz",
          buildContext: () => ({}),
          extract: () => undefined,
        }),
      ).toThrowError(/nonexistent_flow_xyz/);
    });

    it("error message includes the known flowRefs", () => {
      let message = "";
      try {
        makeFlowStepComponent({ flowRef: "unknown", buildContext: () => ({}), extract: () => undefined });
      } catch (e) {
        message = String((e as Error).message);
      }
      // Should name at least one known ref (e.g. "track") in the error.
      expect(message).toMatch(/track|project_name|identity_lite/);
    });
  });

  describe("resolve → run → extract → complete (SC-006)", () => {
    it("mounts the factory component for 'track', renders FlowStepHost with correct title", async () => {
      const TrackComponent = makeFlowStepComponent(buildTrackOptions());
      const onComplete = vi.fn();
      const onBack = vi.fn();

      await act(async () => {
        render(<TrackComponent onComplete={onComplete} onBack={onBack} />);
      });

      expect(screen.getByTestId("flow-step-host")).toBeTruthy();
      expect(screen.getByTestId("flow-step-title").textContent).toBe("Authoring Track");
    });

    it("fires setSelectedTrack('copy') BEFORE onComplete when extract succeeds (R7 ordering)", async () => {
      const callOrder: string[] = [];

      const onCommitSpy = vi.fn((_extracted: TrackPayload, deps: Parameters<NonNullable<FlowStepOptions<TrackPayload>["onCommit"]>>[1]) => {
        callOrder.push("onCommit");
        deps.setSelectedTrack(_extracted.track);
      });
      const onCompleteSpy = vi.fn(() => {
        callOrder.push("onComplete");
      });

      const TrackComponent = makeFlowStepComponent(
        buildTrackOptions({ onCommit: onCommitSpy }),
      );

      await act(async () => {
        render(<TrackComponent onComplete={onCompleteSpy} />);
      });

      // Trigger completion via the FlowStepHost stub.
      await act(async () => {
        fireEvent.click(screen.getByTestId("fsh-complete"));
      });

      // onCommit fires before onComplete.
      expect(callOrder).toEqual(["onCommit", "onComplete"]);
      // setSelectedTrack fired from within onCommit.
      expect(mockSetSelectedTrack).toHaveBeenCalledWith("copy");
      expect(onCompleteSpy).toHaveBeenCalledWith({ track: "copy" });
    });

    it("stays on step (no onComplete call) when extract returns undefined", async () => {
      const extractReturnsUndefined = vi.fn(() => undefined as undefined);
      const onCompleteSpy = vi.fn();

      const TrackComponent = makeFlowStepComponent(
        buildTrackOptions({
          extract: extractReturnsUndefined,
          onCommit: vi.fn(),
        }),
      );

      await act(async () => {
        render(<TrackComponent onComplete={onCompleteSpy} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("fsh-complete"));
      });

      // extract returned undefined → stay on step → onComplete not called.
      expect(extractReturnsUndefined).toHaveBeenCalled();
      expect(onCompleteSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // FIX 5: seeds depsRef indirection — getSeedValue/onAnswerCommit receive
  // current deps at call time, not at render time (verifies the useRef mechanism).
  // Also verifies per-mount displayNameRef isolation (re-entry reset).
  // ---------------------------------------------------------------------------

  describe("seeds — depsRef indirection (FIX 5)", () => {
    // Build a project_name-like options record that reads/writes displayNameRef.
    function buildSeedOptions(): FlowStepOptions<{ name: string }> {
      return {
        flowRef: "project_name",
        title: "Name your keyboard",
        buildContext: () => ({}),
        extract(result: SurveyPhaseResult): { name: string } | undefined {
          const a = result.answers.find((x) => x.questionId === "track_choice");
          return a !== undefined ? { name: String(a.value) } : undefined;
        },
        seeds: {
          getSeedValue(questionId: string, deps: FlowStepDeps): string | undefined {
            if (questionId === "the_name") return deps.displayNameRef.current;
            return undefined;
          },
          onAnswerCommit(questionId: string, value: string | string[] | undefined, deps: FlowStepDeps): void {
            if (questionId === "the_name") {
              deps.displayNameRef.current = typeof value === "string" ? value : "";
            }
          },
        },
      };
    }

    it("getSeedValue receives current deps.displayNameRef at call time via depsRef indirection", async () => {
      const SeedComponent = makeFlowStepComponent(buildSeedOptions());

      await act(async () => {
        render(<SeedComponent onComplete={vi.fn()} />);
      });

      // displayNameRef starts as "" on a fresh mount.
      expect(mockFlowStepHostGetSeedValueRef.current).not.toBeNull();
      expect(mockFlowStepHostGetSeedValueRef.current!("the_name")).toBe("");

      // Simulate onAnswerCommit writing to displayNameRef via depsRef.
      expect(mockFlowStepHostOnAnswerCommitRef.current).not.toBeNull();
      mockFlowStepHostOnAnswerCommitRef.current!("the_name", "Hausa (new)");

      // getSeedValue now reads the updated value — proves depsRef is live.
      expect(mockFlowStepHostGetSeedValueRef.current!("the_name")).toBe("Hausa (new)");
    });

    it("fresh mount does NOT retain the previous mount's displayNameRef value (re-entry resets)", async () => {
      const SeedComponent = makeFlowStepComponent(buildSeedOptions());
      const onComplete = vi.fn();

      // First mount: simulate writing a display name.
      await act(async () => {
        render(<SeedComponent onComplete={onComplete} />);
      });
      mockFlowStepHostOnAnswerCommitRef.current!("the_name", "Session One Value");
      expect(mockFlowStepHostGetSeedValueRef.current!("the_name")).toBe("Session One Value");

      // Unmount (simulates survey re-entry / navigation back past this step).
      cleanup();
      vi.clearAllMocks();

      // Second mount: displayNameRef must start at "" — NOT "Session One Value".
      await act(async () => {
        render(<SeedComponent onComplete={vi.fn()} />);
      });
      // A fresh useRef("") is allocated; the prior session's value is gone.
      expect(mockFlowStepHostGetSeedValueRef.current!("the_name")).toBe("");
    });
  });
});
