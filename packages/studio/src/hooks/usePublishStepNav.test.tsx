// usePublishStepNav — step id from context, stable handler wrappers, clear on
// unmount, and the footer reading only its own step (spec 081 FR-012, FR-050).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { render } from "../test/renderWithI18n.tsx";
import { StepNavContext, usePublishStepNav } from "./usePublishStepNav.ts";
import { STANDALONE_STEP_ID, useStepNavStore } from "../stores/stepNavStore.ts";
import { StepNavCluster } from "../components/StepNavCluster.tsx";

function Publisher({ onNext, label = "Next →" }: { onNext: () => void; label?: string }) {
  usePublishStepNav({ forward: { label, onClick: onNext, testId: "demo-next" } });
  return null;
}

afterEach(() => {
  cleanup();
});

describe("usePublishStepNav", () => {
  it("publishes under the StepNavContext step id", () => {
    render(
      <StepNavContext.Provider value="identity">
        <Publisher onNext={() => {}} />
      </StepNavContext.Provider>,
    );
    const entries = useStepNavStore.getState().entries;
    expect(entries["identity"]?.spec.forward?.testId).toBe("demo-next");
    expect(entries[STANDALONE_STEP_ID]).toBeUndefined();
  });

  it("publishes under STANDALONE_STEP_ID with no provider", () => {
    render(<Publisher onNext={() => {}} />);
    expect(useStepNavStore.getState().entries[STANDALONE_STEP_ID]).toBeDefined();
  });

  it("clears its entry on unmount", () => {
    const { unmount } = render(<Publisher onNext={() => {}} />);
    unmount();
    expect(useStepNavStore.getState().entries[STANDALONE_STEP_ID]).toBeUndefined();
  });

  it("calls the latest handler through a stable wrapper without rewriting the store", () => {
    const first = vi.fn();
    const second = vi.fn();
    let swap: () => void = () => {};
    function Swapping() {
      const [useSecond, setUseSecond] = useState(false);
      swap = () => setUseSecond(true);
      return <Publisher onNext={useSecond ? second : first} />;
    }
    render(<Swapping />, { withStepNav: true });
    const entriesBefore = useStepNavStore.getState().entries;

    act(() => swap());
    expect(useStepNavStore.getState().entries).toBe(entriesBefore);

    fireEvent.click(screen.getByTestId("demo-next"));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("republishes when a descriptive field changes", () => {
    const { rerender } = render(<Publisher onNext={() => {}} />, { withStepNav: true });
    expect(screen.getByTestId("demo-next").textContent).toBe("Next →");
    rerender(<Publisher onNext={() => {}} label="Finish" />);
    expect(screen.getByTestId("demo-next").textContent).toBe("Finish");
  });

  it("is not rendered by the cluster for a different step", () => {
    render(
      <>
        <StepNavContext.Provider value="A">
          <Publisher onNext={() => {}} />
        </StepNavContext.Provider>
        <StepNavCluster stepId="B" />
      </>,
    );
    expect(screen.queryByTestId("demo-next")).toBeNull();
    expect(screen.queryByTestId("step-nav")).toBeNull();
  });
});
