// StepHost — revising a section opened from Output (spec 094 research R3,
// contracts C5).
//
// An arrival whose `returnTo` is Output:
//   - pane step: origin-aware banner with "Discard changes and go back";
//     confirming returns to Output (the existing 5b path);
//   - full-layout step: the footer shows "Back to testing" (the editor's own
//     forward, which completes and returns) and "Discard changes and go back",
//     published on stepNavStore's revision channel;
//   - Discard restores the arrival snapshot and records nothing.
// A decision-trail arrival on a full-layout step is unchanged (no footer
// revision actions).

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useStepNavStore } from "../stores/stepNavStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";
import type { ReducerDeps } from "../steps/reducer.ts";
import type { Location } from "../lib/location.ts";

const { pending, jumpToLocation } = vi.hoisted(() => ({
  pending: { current: null as { returnTo?: Location } | null },
  jumpToLocation: vi.fn(),
}));

vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jumpToLocation.ts")>()),
  peekPendingJump: () => pending.current,
  clearPendingJump: () => {},
  jumpToLocation: (...args: unknown[]) => jumpToLocation(...args),
}));

vi.mock("../steps/manifest.ts", async () => {
  const { usePublishStepNav } = await import("../hooks/usePublishStepNav.ts");
  function PaneStep({ onComplete }: { onComplete: (r: unknown) => void }) {
    return (
      <button type="button" data-testid="pane-complete" onClick={() => onComplete({})}>
        Complete
      </button>
    );
  }
  function FullStep({ onComplete }: { onComplete: (r: unknown) => void }) {
    usePublishStepNav({ forward: { label: "Continue", onClick: () => onComplete({}), testId: "rules-continue" } });
    return <div data-testid="full-step">rules editor</div>;
  }
  return {
    manifest: [
      { kind: "editor-step", id: "identity", title: "Identity", inputs: [], writes: [], component: PaneStep },
      { kind: "editor-step", id: "punctuation", title: "Punctuation", inputs: [], writes: [], component: PaneStep },
      { kind: "editor-step", id: "rules", title: "Rules", inputs: [], writes: [], component: FullStep, layout: "full" },
    ],
  };
});

import { StepHost } from "./StepHost.tsx";
import { StepNavCluster } from "./StepNavCluster.tsx";

const deps: ReducerDeps = {
  lockDesktop: vi.fn(),
  setTouchLayoutJson: vi.fn(),
  clearStale: vi.fn(),
  instantiateFromBase: vi.fn(),
  instantiateFromExisting: vi.fn(),
  buildTouchLayoutJson: vi.fn(() => ({ json: null, warnings: [] })),
  resolveBaseTouchJson: vi.fn(() => undefined),
  instantiateFromBaseIfConfirmed: vi.fn(() => true),
};

function arriveAt(stepId: "punctuation" | "rules", returnTo: Location): void {
  act(() => {
    useSurveySessionStore.getState().advance(stepId);
  });
  pending.current = { returnTo };
}

function renderHostWithFooter(stepId: string) {
  return render(
    <>
      <StepHost reducerDeps={deps} onStartOver={() => {}} />
      <StepNavCluster stepId={stepId} />
    </>,
  );
}

afterEach(() => {
  cleanup();
  pending.current = null;
  jumpToLocation.mockClear();
  useSurveySessionStore.getState().reset();
  useStepNavStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useDecisionLogStore.getState().reset();
});

describe("full-layout step opened from Output", () => {
  it("publishes Back to testing and Discard in the footer", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("rules", { route: "output" });
    renderHostWithFooter("rules");

    expect(screen.getByTestId("step-revision-back-to-testing").textContent).toBe("Back to testing");
    expect(screen.getByTestId("step-revision-discard").textContent).toBe("Discard changes and go back");
    expect(screen.queryByTestId("rules-continue")).toBeNull();
  });

  it("Back to testing completes the step and returns to Output", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("rules", { route: "output" });
    renderHostWithFooter("rules");

    fireEvent.click(screen.getByTestId("step-revision-back-to-testing"));
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "output" });
  });

  it("Discard restores the arrival state, records nothing, and returns", () => {
    seedInstantiatedWorkingCopy([]);
    useWorkingCopyStore.getState().setTouchLayoutJson('{"before":true}');
    arriveAt("rules", { route: "output" });
    renderHostWithFooter("rules");
    const entriesBefore = useDecisionLogStore.getState().record.entries.length;

    act(() => {
      useWorkingCopyStore.getState().setTouchLayoutJson('{"after":true}');
    });
    fireEvent.click(screen.getByTestId("step-revision-discard"));

    expect(useWorkingCopyStore.getState().touchLayoutJson).toBe('{"before":true}');
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(entriesBefore);
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "output" });
  });

  it("a decision-trail arrival gets no footer revision actions (unchanged)", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("rules", { route: "trail" });
    renderHostWithFooter("rules");

    expect(screen.queryByTestId("step-revision-discard")).toBeNull();
    expect(screen.getByTestId("rules-continue").textContent).toBe("Continue");
  });

  it("clears the revision actions when the step unmounts", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("rules", { route: "output" });
    const view = renderHostWithFooter("rules");
    expect(useStepNavStore.getState().revision?.stepId).toBe("rules");
    view.unmount();
    expect(useStepNavStore.getState().revision).toBeNull();
  });
});

describe("pane step opened from Output", () => {
  it("shows the Output-origin banner with Discard", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("punctuation", { route: "output" });
    renderHostWithFooter("punctuation");

    const banner = screen.getByTestId("step-deep-link-return-banner");
    expect(banner.textContent).toMatch(/opened this from Output/);
    expect(screen.getByTestId("step-revision-discard")).toBeTruthy();
  });

  it("the decision-trail banner keeps its own copy and has no Discard", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("punctuation", { route: "trail" });
    renderHostWithFooter("punctuation");

    expect(screen.getByTestId("step-deep-link-return-banner").textContent).toMatch(/from Decisions/);
    expect(screen.queryByTestId("step-revision-discard")).toBeNull();
  });

  it("confirming returns to Output", () => {
    seedInstantiatedWorkingCopy([]);
    arriveAt("punctuation", { route: "output" });
    renderHostWithFooter("punctuation");

    fireEvent.click(screen.getByTestId("pane-complete"));
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "output" });
  });
});
