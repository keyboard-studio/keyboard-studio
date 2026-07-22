// stepHost.renderSmoke.test.tsx — T020 (spec 028 Stage 5).
//
// SC-005 guard: for each manifest step id, mount StepHost at that step (set
// surveySessionStore activeStepId) and assert:
//   1. The declared manifest component renders in the correct chrome.
//   2. layout:"full" steps render inside the full-screen wrapper (height:100%).
//   3. Non-full-layout steps render their content directly (no full-screen wrapper).
//   4. Terminal "done" renders the survey-complete panel.
//   5. Terminal "unsupported" renders UnsupportedScriptStub (+ identityResult set).
//
// Mock strategy: same shallow mock idiom as StudioShell.test.tsx and
// stepHost.goldenWalk.test.tsx. All heavy child components are replaced with
// lightweight data-testid stubs so WASM and VFS stay out of the picture.
// ReducerDeps is fully mocked (no real store actions needed — we only test
// chrome selection, not side-effect dispatch).
//
// Chrome detection:
//   layout:"full" — StepHost returns a <div style={{ height:"100%", overflow:"hidden" }}>
//                   wrapping the component. We assert the outer div has data-testid
//                   injected by the stub component INSIDE a height-100% container.
//   pane/omitted  — StepHost returns the component content directly.
//
// To distinguish these cases we use a data-testid on the component stub plus a
// container attribute check on the nearest parent div.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../../src/test/renderWithI18n.tsx";
import { useSurveySessionStore } from "../../src/stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../src/stores/workingCopyStore.ts";
import type { ActiveStepId } from "../../src/stores/surveySessionStore.ts";
import type { ReducerDeps } from "../../src/steps/reducer.ts";

// ---------------------------------------------------------------------------
// Mock all heavy child components used by the manifest adapters
// ---------------------------------------------------------------------------

// Mock survey/FlowStepHost.tsx — used directly by the factory components for
// track, project_name, and phase_f_helpdocs steps (spec 029 convergence).
// Renders a per-flow testid stub so SC-005 can detect which factory component mounted.
vi.mock("../../src/survey/FlowStepHost.tsx", () => ({
  FlowStepHost: ({ flow }: { flow: { flow_id: string } }) => (
    <div data-testid={`stub-FlowStepHost-${flow.flow_id}`} />
  ),
}));

vi.mock("../../src/survey/index.ts", () => ({
  IdentityLite: () => <div data-testid="stub-IdentityLite" />,
  Prefill: () => <div data-testid="stub-Prefill" />,
  PhaseB: () => <div data-testid="stub-PhaseB" />,
  PhaseA: () => <div data-testid="stub-PhaseA" />,
  SurveyRunner: () => <div data-testid="stub-SurveyRunner" />,
  CharactersStep: () => <div data-testid="stub-CharactersStep" />,
  extractIdentityLite: (r: unknown) => r,
  extractIdentity: () => ({}),
  extractProvenance: () => ({}),
  buildPrefillRows: () => [],
}));

vi.mock("../../src/survey/CharactersStep.tsx", () => ({
  CharactersStep: () => <div data-testid="stub-CharactersStep" />,
}));

vi.mock("../../src/editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: () => <div data-testid="stub-BaseResolution" />,
}));

vi.mock("../../src/editors/carve/CarveGallery.tsx", () => ({
  CarveGallery: () => <div data-testid="stub-CarveGallery" />,
}));

vi.mock("../../src/editors/assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: () => <div data-testid="stub-MechanismGallery" />,
}));

vi.mock("../../src/editors/assignLoop/TouchGallery.tsx", () => ({
  TouchGallery: () => <div data-testid="stub-TouchGallery" />,
}));

vi.mock("../../src/editors/touchSeedSource/TouchSeedSourcePanel.tsx", () => ({
  TouchSeedSourcePanel: () => <div data-testid="stub-TouchSeedSourcePanel" />,
}));

vi.mock("../../src/components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: ({ script }: { script: string }) => (
    <div data-testid="stub-UnsupportedScriptStub" data-script={script} />
  ),
}));

vi.mock("../../src/editors/panels/TrackStep.tsx", () => ({
  TrackStep: () => <div data-testid="stub-TrackStep" />,
}));

vi.mock("../../src/editors/panels/ProjectNameStep.tsx", () => ({
  ProjectNameStep: () => <div data-testid="stub-ProjectNameStep" />,
}));

vi.mock("../../src/editors/panels/TrackOneIdentityPanel.tsx", () => ({
  TrackOneIdentityPanel: () => <div data-testid="stub-TrackOneIdentityPanel" />,
}));

vi.mock("../../src/editors/panels/ScaffoldForm.tsx", () => ({
  ScaffoldForm: () => <div data-testid="stub-ScaffoldForm" />,
}));

// Mock hooks that adapters use internally (FR-007 self-sourcing)
vi.mock("../../src/hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));

vi.mock("../../src/hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));


vi.mock("../../src/lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("../../src/lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
}));

vi.mock("../../src/lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
}));

vi.mock("../../src/lint/lintToQuestion.ts", () => ({
  buildFindingsByQuestionId: () => ({}),
}));

// ---------------------------------------------------------------------------
// Import component under test — AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { StepHost } from "../../src/components/StepHost.tsx";
import { manifest } from "../../src/steps/manifest.ts";
import type { EditorStep } from "../../src/steps/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A no-op ReducerDeps suitable for smoke tests (chrome selection only). */
const noopReducerDeps: ReducerDeps = {
  lockDesktop: vi.fn(),
  clearStale: vi.fn(),
  setTouchLayoutJson: vi.fn(),
  instantiateFromBase: vi.fn(),
  instantiateFromExisting: vi.fn(),
  buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
  resolveBaseTouchJson: () => undefined,
  instantiateFromBaseIfConfirmed: () => false,
};

// Fake base keyboard — satisfies the localBase guard in TrackStepFactoryComponent.
const fakeBase: import("@keyboard-studio/contracts").BaseKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"],
  version: "1.0",
};

/** Set the active step id in the session store and render StepHost. */
async function mountAt(stepId: ActiveStepId) {
  act(() => {
    useSurveySessionStore.setState({
      activeStepId: stepId,
      // Seed localBase so TrackStepAdapter's null guard passes.
      localBase: fakeBase,
    });
  });
  await act(async () => {
    render(
      <StepHost reducerDeps={noopReducerDeps} onStartOver={() => undefined} />,
    );
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Terminal: "done" renders survey-complete panel
// ---------------------------------------------------------------------------

describe('StepHost terminal: "done"', () => {
  it('renders the survey-complete panel with Start-over button', async () => {
    await mountAt("done");
    // getByText throws if not found — no need for toBeTruthy assertions.
    screen.getByText(/Survey complete/i);
    screen.getByText(/Start over/i);
  });
});

// ---------------------------------------------------------------------------
// Terminal: "unsupported" renders UnsupportedScriptStub
// ---------------------------------------------------------------------------

describe('StepHost terminal: "unsupported"', () => {
  beforeEach(() => {
    // unsupported branch reads identityResult — seed it so the stub renders.
    act(() => {
      useSurveySessionStore.setState({
        identityResult: {
          autonym: "Test",
          english: "Test",
          languageSubtag: "te",
          region: "",
          targetScriptRaw: "Ethi",
          bcp47: "te-Ethi",
          supported: false,
          prefill: { script: "Ethi", scriptClass: "abugida", routingGroup: "non-roman" },
        },
      });
    });
  });

  it('renders UnsupportedScriptStub with Start-over button', async () => {
    await mountAt("unsupported");
    screen.getByTestId("stub-UnsupportedScriptStub");
    screen.getByText(/Start over/i);
  });
});

// ---------------------------------------------------------------------------
// SC-005: declared component === mounted component for all manifest ids
// ---------------------------------------------------------------------------

// Collect manifest editor steps only (kind:"editor-step"). These are the
// steps StepHost resolves. (Non-editor-step kinds are not in the current
// manifest, but the test is forward-safe via the kind filter.)
const editorSteps = manifest.filter(
  (s): s is EditorStep => s.kind === "editor-step",
);

// For each editor step: the declared component should mount and a stub from
// one of its dependency chains should be present in the DOM. We map each
// step.id to the data-testid we expect to find — this is the SC-005 contract:
// the declared component is what actually renders.
//
// The mapping is derived from the adapter/factory → child component chain:
//   identityStep      → IdentityLiteAdapter              → IdentityLite stub
//   chooseBaseStep    → BaseResolutionAdapter             → BaseResolution stub
//   trackStep         → TrackStepFactoryComponent         → FlowStepHost stub (flow_id=track)
//   projectNameStep   → ProjectNameStepFactoryComponent   → FlowStepHost stub (flow_id=project_name)
//   charactersStep    → CharactersStep                    → stub-CharactersStep
//   carveStep         → CarveAdapter                      → CarveGallery stub
//   mechanismsStep    → AddPhysicalAdapter                → MechanismGallery stub
//   touchSeedSourceStep → TouchSeedSourcePanel            → TouchSeedSourcePanel stub
//   touchStep         → AddTouchAdapter                   → TouchGallery stub
//   helpStep          → PhaseFStepFactoryComponent        → FlowStepHost stub (flow_id=phase_f_helpdocs)
//   packageStep       → PhaseFStepFactoryComponent        → FlowStepHost stub (flow_id=phase_f_helpdocs)
const STEP_TO_EXPECTED_STUB: Record<string, string> = {
  identity: "stub-IdentityLite",
  choose_base: "stub-BaseResolution",
  track: "stub-FlowStepHost-track",
  project_name: "stub-FlowStepHost-project_name",
  characters: "stub-CharactersStep",
  carve: "stub-CarveGallery",
  mechanisms: "stub-MechanismGallery",
  touch_seed_source: "stub-TouchSeedSourcePanel",
  touch: "stub-TouchGallery",
  help: "stub-FlowStepHost-phase_f_helpdocs",
  package: "stub-FlowStepHost-phase_f_helpdocs",
};

// Full-layout step ids (declared in manifest as layout:"full").
const FULL_LAYOUT_IDS = new Set<string>(["carve", "mechanisms", "touch"]);

describe("SC-005: declared component matches mounted component for all manifest editor steps", () => {
  for (const step of editorSteps) {
    const expectedStub = STEP_TO_EXPECTED_STUB[step.id];
    if (expectedStub === undefined) continue;

    it(`step "${step.id}" renders declared component "${expectedStub}"`, async () => {
      await mountAt(step.id as ActiveStepId);
      screen.getByTestId(expectedStub);
    });
  }
});

// ---------------------------------------------------------------------------
// Chrome-by-layout: full-screen vs pane (FR-002, R4)
//
// layout:"full" steps: StepHost wraps the content in a div with
//   style={{ height:"100%", overflow:"hidden" }}.
// pane/omitted steps: content returned directly (no wrapper).
//
// Detection strategy: query the rendered output's container element.
// For full-screen steps the direct parent of the stub div will have
// inline style height:100%. For pane steps it will not.
// ---------------------------------------------------------------------------

describe("Chrome-by-layout: full-screen for layout:full steps (FR-002, R4)", () => {
  for (const step of editorSteps) {
    if (!FULL_LAYOUT_IDS.has(step.id)) continue;

    it(`step "${step.id}" (layout:full) renders inside height:100% container`, async () => {
      await mountAt(step.id as ActiveStepId);
      const stubTestId = STEP_TO_EXPECTED_STUB[step.id];
      if (stubTestId === undefined) return;

      const stub = screen.getByTestId(stubTestId);
      const parent = stub.parentElement!;
      // StepHost wraps full-screen steps in a div with style.height === "100%".
      expect(parent.style.height).toBe("100%");
      expect(parent.style.overflow).toBe("hidden");
    });
  }
});

describe("Chrome-by-layout: pane content returned directly for non-full-screen steps (FR-002, R4)", () => {
  for (const step of editorSteps) {
    if (FULL_LAYOUT_IDS.has(step.id)) continue;
    const expectedStub = STEP_TO_EXPECTED_STUB[step.id];
    if (expectedStub === undefined) continue;

    it(`step "${step.id}" (pane) renders without height:100% wrapper`, async () => {
      await mountAt(step.id as ActiveStepId);
      const stub = screen.getByTestId(expectedStub);
      // For pane steps StepHost returns content directly — no height:100% parent.
      // The immediate parent comes from the test harness body, not a StepHost wrapper.
      expect(stub.parentElement!.style.height).not.toBe("100%");
    });
  }
});
