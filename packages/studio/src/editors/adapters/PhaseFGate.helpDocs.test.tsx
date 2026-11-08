// PhaseFGate — spec 090 T052: the gate's completion wrap records the
// composite `help-docs` decision (the gallery-host registration for the
// help step), composed from the completion's own answers, before handing
// the result on — so StepHost's completion recorder can append the
// decision's one log entry. The write is a decision record only; the
// working copy is untouched here (089's flow applies own that path).

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { seedInstantiatedWorkingCopy } from "../../test/workingCopy.ts";
import { installDialogShim } from "../../test/dialogShim.ts";
import { useDecisionStore, getDecisionSnapshot } from "../../stores/decisionStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";

beforeAll(installDialogShim);

// The PhaseFGate module graph is heavy to transform + import on this VM
// (~17s import, ~34s transform — #2581): importing it inside a test put
// ~21s of that cost under vitest's 30s per-test timeout, so the first test
// timed out whenever a build ran concurrently, and the timed-out render
// then leaked into the second test ("Found multiple elements"). The import
// therefore happens once in a beforeAll — outside any test's clock — with
// a 60s hook budget for the one-time transform; each test then runs in
// milliseconds against the cached module.
let PhaseFGate: typeof import("./PhaseFGate.tsx").PhaseFGate;
beforeAll(async () => {
  ({ PhaseFGate } = await import("./PhaseFGate.tsx"));
}, 60_000);

// The Phase F content is stubbed to a button that completes with a fixed
// phase result — this test isolates the gate's completion wrap.
const PHASE_RESULT = {
  phase: "F" as const,
  answers: [
    { questionId: "pf_welcome_paragraph", answerType: "text" as const, value: "Welcome!" },
    { questionId: "pf_usage_tip_1", answerType: "text" as const, value: "Press a key." },
  ],
};

vi.mock("./flowStepOptions.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flowStepOptions.tsx")>()),
  PhaseFStepFactoryComponent: (props: EditorStepProps) => (
    <button
      type="button"
      data-testid="phasef-complete"
      onClick={() => props.onComplete(PHASE_RESULT)}
    >
      Complete
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  useDecisionStore.getState().reset();
});

describe("PhaseFGate — help-docs registration (spec 090 T052)", () => {
  it("records the composite help-docs decision at gate completion, then hands the result on", async () => {
    seedInstantiatedWorkingCopy(["á"]);
    const onComplete = vi.fn();
    render(<PhaseFGate onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("phasef-complete"));

    const record = getDecisionSnapshot()["help-docs"];
    expect(record).toBeDefined();
    expect(record?.provenance).toBe("derived");
    expect(record?.step).toBe("help");
    expect(record?.value).toEqual({
      answers: {
        pf_welcome_paragraph: "Welcome!",
        pf_usage_tip_1: "Press a key.",
      },
    });
    expect(onComplete).toHaveBeenCalledWith(PHASE_RESULT);
  });

  it("adds exactly the one record, and a re-completion replaces rather than duplicates", async () => {
    seedInstantiatedWorkingCopy(["á"]);
    // The seed itself settles decisions (character-inventory); the gate's
    // wrap must add help-docs and nothing else.
    const seededKeys = Object.keys(getDecisionSnapshot());
    const onComplete = vi.fn();
    render(<PhaseFGate onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("phasef-complete"));
    fireEvent.click(screen.getByTestId("phasef-complete"));
    expect(Object.keys(getDecisionSnapshot()).sort()).toEqual(
      [...seededKeys, "help-docs"].sort(),
    );
  });
});
