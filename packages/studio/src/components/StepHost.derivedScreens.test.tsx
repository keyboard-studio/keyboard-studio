// StepHost.derivedScreens — SC-001 at the StepHost level (spec 091 T011).
//
// The registry seam (steps/manifest.ts `buildManifest`, T010) builds the
// manifest StepHost resolves from, from a supplied module list. This test
// builds that list twice from the REAL registry modules — once with the
// declaration edit (il_language_autonym gains requires: ["base-keyboard"])
// once without — and asserts the screen sequence StepHost is handed
// reflects the edit, and that reverting it restores the baseline.
//
// The step COMPONENTS are trivial stand-ins (the StepHost.test.tsx idiom:
// mock registerEditorSteps + the hosts manifest.ts imports directly), so
// the test exercises the manifest seam and StepHost's resolution, not the
// panels themselves.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StepHost } from "./StepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { buildManifest } from "../steps/manifest.ts";
import { STEP_ORDER } from "../steps/stepOrder.ts";
import { decisionModules } from "../survey/questions/registry.ts";
import type { DecisionId } from "../decisions/decisionTypes.ts";
import type { ReducerDeps } from "../steps/reducer.ts";

// ---------------------------------------------------------------------------
// Trivial step components: each renders its step id as the marker, so the
// test can assert WHICH step StepHost resolved.
// ---------------------------------------------------------------------------

const { trivialStep } = vi.hoisted(() => {
  function trivialStep(id: string) {
    return {
      kind: "editor-step" as const,
      id,
      title: id,
      inputs: [],
      writes: [],
      component: () => <div data-testid="step-marker">{id}</div>,
    };
  }
  return { trivialStep };
});

vi.mock("../steps/registerEditorSteps.ts", () => ({
  identityStep: trivialStep("identity"),
  layoutStep: trivialStep("layout"),
  chooseBaseStep: trivialStep("choose_base"),
  trackStep: trivialStep("track"),
  projectNameStep: trivialStep("project_name"),
  carveStep: trivialStep("carve"),
  deadkeysStep: trivialStep("deadkeys"),
  rulesStep: trivialStep("rules"),
  mechanismsStep: trivialStep("mechanisms"),
  touchSeedSourceStep: trivialStep("touch_seed_source"),
  touchStep: trivialStep("touch"),
  helpStep: trivialStep("help"),
  packageStep: trivialStep("package"),
}));

vi.mock("../survey/CharactersStepHost.tsx", () => ({
  CharactersStepHost: () => <div data-testid="step-marker">characters</div>,
}));
vi.mock("../survey/marks/MarksStepHost.tsx", () => ({
  MarksStepHost: () => <div data-testid="step-marker">marks</div>,
}));
vi.mock("../survey/punctuation/PunctuationStepHost.tsx", () => ({
  PunctuationStepHost: () => <div data-testid="step-marker">punctuation</div>,
}));
vi.mock("../survey/invisibles/InvisiblesStepHost.tsx", () => ({
  InvisiblesStepHost: () => <div data-testid="step-marker">invisibles</div>,
}));
vi.mock("../survey/convenience/ConvenienceStepHost.tsx", () => ({
  ConvenienceStepHost: () => <div data-testid="step-marker">convenience</div>,
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

// The declaration edit, in a test registry (same edit as T009's pure test:
// the requires edge plus the `next` re-point — see deriveScreens.test.ts for
// the Delta P5 note on why the re-point is part of the edit under 087 sort
// semantics).
const editedModules = decisionModules.map((m) =>
  m.definition.id === "il_language_autonym"
    ? {
        ...m,
        requires: [...(m.requires ?? []), "base-keyboard" as DecisionId],
        definition: { ...m.definition, next: null },
      }
    : m,
);

const BASELINE_IDS = [...STEP_ORDER];
const EDITED_IDS = [
  "identity",
  "layout",
  "choose_base",
  "identity",
  ...BASELINE_IDS.slice(3),
];

afterEach(() => {
  cleanup();
});

describe("StepHost with a manifest built from a supplied module list (SC-001)", () => {
  it("the built sequence reflects the one-line edit: identity splits around choose_base", () => {
    expect(buildManifest(editedModules).map((s) => s.id)).toEqual(EDITED_IDS);
  });

  it("the built sequence from the live registry is the baseline", () => {
    expect(buildManifest().map((s) => s.id)).toEqual(BASELINE_IDS);
    expect(buildManifest(decisionModules).map((s) => s.id)).toEqual(BASELINE_IDS);
  });

  it("StepHost resolves the active screen from the supplied (edited) manifest", () => {
    useSurveySessionStore.setState({ activeStepId: "choose_base", history: [] });
    render(
      <StepHost
        reducerDeps={fakeReducerDeps}
        onStartOver={() => {}}
        manifest={buildManifest(editedModules)}
      />,
    );
    expect(screen.getByTestId("step-marker").textContent).toBe("choose_base");
  });

  it("reverting the edit restores the baseline sequence and StepHost resolution", () => {
    useSurveySessionStore.setState({ activeStepId: "identity", history: [] });
    render(
      <StepHost
        reducerDeps={fakeReducerDeps}
        onStartOver={() => {}}
        manifest={buildManifest(decisionModules)}
      />,
    );
    expect(screen.getByTestId("step-marker").textContent).toBe("identity");
  });
});
