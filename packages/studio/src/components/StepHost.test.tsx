// Unit tests for StepHost's onBack gating (F7 defect 2 — "back button does not
// work"): StepHost must only ever hand a step's component an `onBack` prop
// when the manifest-level back-target genuinely exists (a non-empty sanitized
// history, or the "touch" step's always-available touch_seed_source
// re-entry). A stale "always show Back" render made the button visible,
// enabled, and inert at the very first step (and right after Start-over).
//
// The manifest is mocked down to two trivial editor-steps so this test
// exercises StepHost's own gating decision in isolation, without pulling in
// the real identity/choose_base panels' heavy dependencies (langtags lookup,
// the compile pipeline, etc.) — those are exercised by StudioShell.test.tsx's
// full-walk suite instead.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StepHost } from "./StepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import type { ReducerDeps } from "../steps/reducer.ts";
import type { EditorStepProps } from "../steps/types.ts";

// ---------------------------------------------------------------------------
// Mocked manifest — two trivial editor-steps standing in for "identity" and
// "choose_base". Each renders its own id (so the test can assert which step
// is showing) plus a Back button, present only when StepHost hands it onBack.
// ---------------------------------------------------------------------------

function TrivialStep({ onBack }: EditorStepProps): React.ReactElement {
  return (
    <div>
      <span data-testid="step-marker">rendered</span>
      {onBack !== undefined && (
        <button type="button" onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}

vi.mock("../steps/manifest.ts", () => ({
  manifest: [
    {
      kind: "editor-step",
      id: "identity",
      title: "Identity",
      inputs: [],
      writes: [],
      component: TrivialStep,
    },
    {
      kind: "editor-step",
      id: "choose_base",
      title: "Choose base",
      inputs: [],
      writes: [],
      component: TrivialStep,
    },
  ],
}));

const fakeReducerDeps: ReducerDeps = {
  lockDesktop: vi.fn(),
  setTouchLayoutJson: vi.fn(),
  clearStale: vi.fn(),
  instantiateFromBase: vi.fn(),
  instantiateFromExisting: vi.fn(),
  buildTouchLayoutJson: vi.fn(() => ({ json: null, warnings: [] })),
  resolveBaseTouchJson: vi.fn(() => undefined),
  instantiateFromBaseIfConfirmed: vi.fn(() => true),
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useSurveySessionStore.getState().reset();
});

describe("StepHost onBack gating (F7 defect 2)", () => {
  it("does not offer Back at the very first step (identity, empty history)", () => {
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByTestId("step-marker")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("offers Back after one manifest-step advance", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("clicking Back pops the manifest-level history via the shared dispatch", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    act(() => {
      screen.getByRole("button", { name: "Back" }).click();
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
    expect(useSurveySessionStore.getState().history).toEqual([]);
  });

  it("hides Back again after Start-over", () => {
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    render(<StepHost reducerDeps={fakeReducerDeps} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();

    act(() => {
      useSurveySessionStore.getState().reset();
    });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});
