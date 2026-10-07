// stepHost.fullStepScroll.test.tsx
//
// The Rules and Deadkeys steps are `layout: "full"`, so StepHost wraps them in
// a fixed `height: 100%; overflow: hidden` shell and the step must own its own
// vertical scroll. jsdom does no layout, so this asserts the structure that
// makes scrolling work: the shell is clipped, and the step root directly inside
// it is a full-height `overflowY: auto` container that holds the (tall) body.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../src/test/renderWithI18n.tsx";
import { useSurveySessionStore } from "../../src/stores/surveySessionStore.ts";
import type { ActiveStepId } from "../../src/stores/surveySessionStore.ts";
import type { ReducerDeps } from "../../src/steps/reducer.ts";

// A body far taller than any viewport.
const TALL = "tall-body";
function TallBody() {
  return <div data-testid={TALL} style={{ height: 8000 }} />;
}

vi.mock("../../src/components/rules/DemoPane.tsx", () => ({ DemoPane: TallBody }));
vi.mock("../../src/components/rules/RuleListMount.tsx", () => ({ RuleListMount: () => null }));
vi.mock("../../src/components/rules/GuardSuggestions.tsx", () => ({ GuardSuggestions: () => null }));
vi.mock("../../src/components/rules/RuleBuilderMount.tsx", () => ({ RuleBuilderMount: () => null }));
// The inventory stand-in exposes an edit trigger so the edit tab is reachable.
vi.mock("../../src/editors/deadkey/DeadkeyInventory.tsx", () => ({
  DeadkeyInventory: ({ onEdit }: { onEdit: (info: { id: number }) => void }) => (
    <>
      <button type="button" onClick={() => onEdit({ id: 0 })}>
        open-edit
      </button>
      <TallBody />
    </>
  ),
}));
vi.mock("../../src/editors/deadkey/DeadkeyDefineForm.tsx", () => ({ DeadkeyDefineForm: TallBody }));
vi.mock("../../src/editors/deadkey/DeadkeyDetailEditor.tsx", () => ({ DeadkeyDetailEditor: TallBody }));
vi.mock("../../src/lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

import { StepHost } from "../../src/components/StepHost.tsx";
import { useWorkingCopyStore } from "../../src/stores/workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const noopReducerDeps: ReducerDeps = {
  clearStale: vi.fn(),
  setTouchLayoutJson: vi.fn(),
  instantiateFromBase: vi.fn(),
  instantiateFromExisting: vi.fn(),
  buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
  resolveBaseTouchJson: () => undefined,
  instantiateFromBaseIfConfirmed: () => false,
};

async function mountAt(stepId: ActiveStepId) {
  act(() => {
    useSurveySessionStore.setState({ activeStepId: stepId });
  });
  await act(async () => {
    render(<StepHost reducerDeps={noopReducerDeps} onStartOver={() => undefined} />);
  });
}

/** Deadkeys renders its tabs only once a working IR exists. */
async function mountDeadkeysStep() {
  act(() => {
    useWorkingCopyStore.setState({ ir: makeTestIR() });
  });
  await mountAt("deadkeys");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function expectScrollsInsideShell(rootTestId: string) {
  const root = screen.getByTestId(rootTestId);
  const shell = root.parentElement!;
  // StepHost's full-layout shell clips overflow...
  expect(shell.style.height).toBe("100%");
  expect(shell.style.overflow).toBe("hidden");
  // ...so the step root must be the scroller.
  expect(root.style.height).toBe("100%");
  expect(root.style.overflowY).toBe("auto");
  expect(root.style.boxSizing).toBe("border-box");
  // The tall body lives inside the scroller, not beside it.
  expect(root.contains(screen.getByTestId(TALL))).toBe(true);
}

describe("full-layout document steps scroll inside StepHost's clipped shell", () => {
  it("rules step", async () => {
    await mountAt("rules");
    expectScrollsInsideShell("rules-step");
  });

  it("deadkeys step (inventory tab)", async () => {
    await mountDeadkeysStep();
    expectScrollsInsideShell("deadkey-step");
  });

  it("deadkeys step (define tab)", async () => {
    await mountDeadkeysStep();
    fireEvent.click(screen.getByRole("tab", { name: "Define new deadkey" }));
    // The inventory has been swapped out, so the tall body is this tab's.
    expect(screen.queryByRole("button", { name: "open-edit" })).toBeNull();
    expectScrollsInsideShell("deadkey-step");
  });

  it("deadkeys step (edit tab)", async () => {
    await mountDeadkeysStep();
    fireEvent.click(screen.getByRole("button", { name: "open-edit" }));
    // The inventory has been swapped out, so the tall body is this tab's.
    expect(screen.queryByRole("button", { name: "open-edit" })).toBeNull();
    expectScrollsInsideShell("deadkey-step");
  });
});
