// StepNavCluster — Back / Continue never move (ruling 2026-11-06).
//
// Back is slot 1 and Continue (forward) is slot 2. Extra buttons — the
// secondary slot (e.g. Undo, Skip) and the revision Discard — render AFTER
// both, so one appearing or disappearing never shifts Back or Continue.
// This supersedes the Nov 3 "Undo between Back and Continue" placement:
// the secondary slot still exists, it just sits to the right now.

import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useStepNavStore, type StepNavSpec } from "../stores/stepNavStore.ts";
import { StepNavCluster } from "./StepNavCluster.tsx";

const noop = () => {};

const BACK_FORWARD: StepNavSpec = {
  back: { label: "← Back", onClick: noop, testId: "rules-back" },
  forward: { label: "Continue", onClick: noop, testId: "rules-continue" },
};

function navTestIds(): string[] {
  const group = screen.getByTestId("step-nav");
  return [...group.querySelectorAll("button")].map(
    (b) => b.getAttribute("data-testid") ?? "?",
  );
}

afterEach(() => {
  cleanup();
  useStepNavStore.getState().reset();
});

describe("StepNavCluster button stability", () => {
  it("renders Back, Continue, then the secondary — extras never sit between them", () => {
    useStepNavStore.getState().publish("rules", "editor", {
      ...BACK_FORWARD,
      secondary: { label: "Undo", onClick: noop, testId: "rules-undo" },
    });
    render(<StepNavCluster stepId="rules" />);

    expect(navTestIds()).toEqual(["rules-back", "rules-continue", "rules-undo"]);
  });

  it("a secondary appearing later does not move Back or Continue", () => {
    useStepNavStore.getState().publish("rules", "editor", BACK_FORWARD);
    render(<StepNavCluster stepId="rules" />);
    expect(navTestIds()).toEqual(["rules-back", "rules-continue"]);

    act(() => {
      useStepNavStore.getState().publish("rules", "editor", {
        ...BACK_FORWARD,
        secondary: { label: "Undo", onClick: noop, testId: "rules-undo" },
      });
    });

    // Back and Continue keep their slots; Undo grows to the right of both.
    expect(navTestIds()).toEqual(["rules-back", "rules-continue", "rules-undo"]);
  });

  it("the revision Discard renders after Continue too", () => {
    useStepNavStore.getState().publish("rules", "editor", BACK_FORWARD);
    useStepNavStore
      .getState()
      .publishRevision({ stepId: "rules", onDiscard: noop, renameForward: false });
    render(<StepNavCluster stepId="rules" />);

    expect(navTestIds()).toEqual(["rules-back", "rules-continue", "step-revision-discard"]);
  });
});
