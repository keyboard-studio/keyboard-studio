// StepNavCluster — revision-from-Output rendering (spec 094, #2050).
//
// - The "Back to testing" rename applies the revision label AFTER the spread,
//   so a step's own forward ariaLabel can never override the accessible name.
// - Off the targeted step (renameForward: false) the Discard action stays
//   published but the forward button keeps its own name.

import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useStepNavStore } from "../stores/stepNavStore.ts";
import { StepNavCluster } from "./StepNavCluster.tsx";

const noop = () => {};

function publishForward(ariaLabel?: string) {
  useStepNavStore.getState().publish("rules", "editor", {
    forward: {
      label: "Continue",
      onClick: noop,
      testId: "rules-continue",
      ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    },
  });
}

function publishRevision(renameForward: boolean) {
  useStepNavStore.getState().publishRevision({ stepId: "rules", onDiscard: noop, renameForward });
}

afterEach(() => {
  cleanup();
  useStepNavStore.getState().reset();
});

describe("StepNavCluster revision actions", () => {
  it("applies the revision label after the spread, so the step's ariaLabel cannot override it (#2050)", () => {
    publishForward("Continue the rules step");
    publishRevision(true);
    render(<StepNavCluster stepId="rules" />);

    const back = screen.getByTestId("step-revision-back-to-testing");
    expect(back.textContent).toBe("Back to testing");
    expect(back.getAttribute("aria-label")).toBe("Back to testing");
  });

  it("keeps Discard published off the targeted step without renaming forward (#2050)", () => {
    publishForward("Continue the rules step");
    publishRevision(false);
    render(<StepNavCluster stepId="rules" />);

    expect(screen.getByTestId("step-revision-discard").textContent).toBe("Discard changes and go back");
    const forward = screen.getByTestId("rules-continue");
    expect(forward.textContent).toBe("Continue");
    expect(forward.getAttribute("aria-label")).toBe("Continue the rules step");
    expect(screen.queryByTestId("step-revision-back-to-testing")).toBeNull();
  });

  it("without a revision the step's own forward renders untouched", () => {
    publishForward("Continue the rules step");
    render(<StepNavCluster stepId="rules" />);

    const forward = screen.getByTestId("rules-continue");
    expect(forward.textContent).toBe("Continue");
    expect(screen.queryByTestId("step-revision-discard")).toBeNull();
  });
});
