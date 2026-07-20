// Pane-swap gating tests — the Phase B build-list interactive character map
// (spec character-map pane work).
//
// SEAM CHOICE: SurveyView's real branch is
//   showCharacterMap = activeRightPane === "character-map" && discoveryMethod === "build-list"
// rendered as one of two DOM-observable outer <section> nodes distinguished
// by aria-label ("Character map" vs "Keyboard preview" — StudioShell.tsx,
// the section wrapping CharacterMapPane/OSKFrame). That aria-label swap is
// the smallest DOM-observable seam that still exercises the real
// activeRightPane/showCharacterMap computation (manifest lookup +
// discoveryMethod read) without asserting on implementation internals
// (no reaching into component state/props). We mount the real <SurveyView/>
// (not a shallower unit) because activeRightPane is derived by looking up
// the active step in the real `manifest` array, and showCharacterMap also
// depends on the real surveySessionStore.discoveryMethod slot — a true unit
// test would just re-implement that one-line boolean and prove nothing.
//
// This is a NEW, separate file from StudioShell.test.tsx (which already has
// 40+ tests and doesn't touch this gating behavior at all) specifically so
// that suite stays undisturbed. The mock preamble below is copied from
// StudioShell.test.tsx's proven-working import-graph closure (heavy hooks /
// WASM / VFS kept out of the picture) — CharacterMapPane itself is
// deliberately left UNMOCKED (unlike StudioShell.test.tsx's other survey
// children) because exercising the pane-swap means the real
// CharacterMapPane must actually mount; its own short-circuit branch (no
// baseIr) renders deterministically without touching lib/services.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "./stores/phaseBDraftStore.ts";

// ---------------------------------------------------------------------------
// Mock child survey components — shallow stubs (identical shape to
// StudioShell.test.tsx) so we can drive the wizard to the "characters" step
// without touching WASM/VFS/CLDR.
// ---------------------------------------------------------------------------

vi.mock("./survey/FlowStepHost.tsx", () => ({
  FlowStepHost: ({
    flow,
    onComplete,
    onBack,
  }: {
    flow: { flow_id: string };
    onComplete: (result: unknown) => void;
    onBack?: () => void;
  }) => {
    if (flow.flow_id === "track") {
      return (
        <div data-testid="stage-track">
          <button
            type="button"
            data-testid="track-adapt"
            onClick={() =>
              onComplete({
                phase: "G",
                answers: [{ questionId: "track_choice", answerType: "select", value: "adapt" }],
                confirmedInventory: [],
              })
            }
          >
            track-adapt
          </button>
          {onBack !== undefined && (
            <button type="button" data-testid="track-back" onClick={onBack}>
              track-back
            </button>
          )}
        </div>
      );
    }
    return <div data-testid={`flow-stub-${flow.flow_id}`} />;
  },
}));

vi.mock("./survey/index.ts", () => {
  const fakeIdentity = {
    autonym: "English",
    english: "English",
    languageSubtag: "en",
    targetScriptRaw: "Latn",
    bcp47: "en-Latn",
    supported: true,
    prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
  };
  const fakePhaseResult = { phase: "B" as const, answers: [], confirmedInventory: [] };

  return {
    IdentityLite: ({ onComplete }: { onComplete: (result: unknown, identity: unknown) => void }) => (
      <div data-testid="stage-identity">
        <button
          type="button"
          data-testid="identity-complete"
          onClick={() => onComplete(fakePhaseResult, fakeIdentity)}
        >
          identity-complete
        </button>
      </div>
    ),
    Prefill: () => <div data-testid="stage-prefill">stage-prefill</div>,
    PhaseB: () => <div data-testid="stage-B">stage-B</div>,
    PhaseA: () => <div data-testid="stage-A" />,
    SurveyRunner: () => <div data-testid="survey-runner" />,
    extractIdentityLite: (r: unknown) => r,
    extractIdentity: () => ({}),
    extractProvenance: () => ({}),
    buildPrefillRows: () => [],
  };
});

vi.mock("./editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: ({
    onPreview,
    onConfirm,
    previewedBase,
  }: {
    onPreview: (base: unknown) => void;
    onConfirm: () => void;
    previewedBase: unknown;
    previewStatus: string;
  }) => {
    const fakeBase = {
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      displayName: "English (US)",
      targets: ["windows"],
      version: "1.0",
    };
    return (
      <div data-testid="stage-base">
        <button type="button" data-testid="base-preview" onClick={() => onPreview(fakeBase)}>
          base-preview
        </button>
        <button
          type="button"
          data-testid="base-confirm"
          disabled={previewedBase === null}
          onClick={onConfirm}
        >
          base-confirm
        </button>
      </div>
    );
  },
}));

// Carve/mechanisms/sequences/touch stubs — never reached by the gating tests
// below (they stop at "characters"), but StudioShell.tsx imports these
// modules statically, so they must resolve to something lightweight.
vi.mock("./editors/carve/CarveGallery.tsx", () => ({
  CarveGallery: () => <div data-testid="stage-carve" />,
}));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: () => <div data-testid="stage-mechanisms" />,
}));
vi.mock("./editors/sequences/SequenceGallery.tsx", () => ({
  SequenceGallery: () => <div data-testid="stage-sequences" />,
}));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => ({
  TouchGallery: () => <div data-testid="stage-E" />,
}));
vi.mock("./editors/touchSeedSource/TouchSeedSourcePanel.tsx", () => ({
  TouchSeedSourcePanel: () => <div data-testid="stage-seed-source" />,
}));
vi.mock("./components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: ({ script }: { script: string }) => (
    <div data-testid="stage-unsupported">{script}</div>
  ),
}));
vi.mock("./editors/panels/TrackStep.tsx", () => ({
  TrackStep: () => <div data-testid="stage-track-legacy" />,
}));
vi.mock("./editors/panels/ProjectNameStep.tsx", () => ({
  ProjectNameStep: () => <div data-testid="stage-project-name" />,
}));

vi.mock("./components/OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame" />,
}));
vi.mock("./components/OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-toggle" />,
}));

vi.mock("./hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));
vi.mock("./lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
}));
vi.mock("./lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: () => ({ json: "{}", warnings: [] }),
}));

vi.mock("./components/PreviewScreen.tsx", () => ({
  PreviewScreen: () => <div data-testid="preview-screen-root">preview-screen</div>,
}));
vi.mock("./components/OutputScreen.tsx", () => ({
  OutputScreen: () => <div data-testid="output-screen-root">output-screen</div>,
}));
vi.mock("./dashboard/DashboardView.tsx", () => ({
  FlowMapView: () => <div data-testid="flow-map-view">flow-map</div>,
}));
vi.mock("./lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the component under test — AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { SurveyView } from "./StudioShell.tsx";

// ---------------------------------------------------------------------------
// Helper: drive from "identity" to the "characters" step (prefill substage)
// via the SHORTEST path — track-adapt skips project_name entirely.
// ---------------------------------------------------------------------------

function advanceToCharactersStep(): void {
  fireEvent.click(screen.getByTestId("identity-complete")); // identity -> base
  fireEvent.click(screen.getByTestId("base-preview")); // preview (separate click)
  fireEvent.click(screen.getByTestId("base-confirm")); // commit -> track
  fireEvent.click(screen.getByTestId("track-adapt")); // track -> characters (prefill substage)
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  vi.clearAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Gating tests
// ---------------------------------------------------------------------------

describe("SurveyView — right pane gating on the characters step", () => {
  it("discoveryMethod is null (default): OSK preview pane renders, character map does NOT", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCharactersStep();
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    // Still the default discoveryMethod (null) — IntroChooser/manual path invariant.
    expect(useSurveySessionStore.getState().discoveryMethod).toBeNull();

    expect(screen.getByLabelText("Keyboard preview")).toBeTruthy();
    expect(screen.queryByLabelText("Character map")).toBeNull();
    // CharacterMapPane's own heading must not be present either.
    expect(screen.queryByRole("heading", { name: "Character map" })).toBeNull();
  });

  it("discoveryMethod === 'manual': OSK preview pane renders, character map does NOT", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("manual");
    });

    expect(screen.getByLabelText("Keyboard preview")).toBeTruthy();
    expect(screen.queryByLabelText("Character map")).toBeNull();
  });

  it("discoveryMethod === 'build-list' on the characters step: CharacterMapPane renders instead of the OSK preview", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });

    expect(screen.getByLabelText("Character map")).toBeTruthy();
    expect(screen.queryByLabelText("Keyboard preview")).toBeNull();
    // The OSK preview's own mocked components must not render inside the swapped pane.
    expect(screen.queryByTestId("osk-frame")).toBeNull();
    // CharacterMapPane's own heading (the real, unmocked component) confirms
    // it is genuinely mounted, not a stand-in.
    expect(screen.getByRole("heading", { name: "Character map" })).toBeTruthy();
  });

  it("build-list set BEFORE reaching characters (IntroChooser ordering) still gates correctly once the step becomes active", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    // Set discoveryMethod pre-emptively while still on "track" — activeRightPane
    // for the track step is "preview" (default), so showCharacterMap must stay
    // false even though discoveryMethod is already "build-list".
    fireEvent.click(screen.getByTestId("identity-complete"));
    fireEvent.click(screen.getByTestId("base-preview"));
    fireEvent.click(screen.getByTestId("base-confirm"));
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });
    expect(screen.getByLabelText("Keyboard preview")).toBeTruthy();

    // Now advance into "characters" — the same discoveryMethod value gates
    // the pane swap on ONLY once activeRightPane flips to "character-map".
    fireEvent.click(screen.getByTestId("track-adapt"));
    expect(screen.getByLabelText("Character map")).toBeTruthy();
  });

  it("reverting discoveryMethod to null while still on characters reverts the pane back to OSK preview", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });
    expect(screen.getByLabelText("Character map")).toBeTruthy();

    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod(null);
    });
    expect(screen.getByLabelText("Keyboard preview")).toBeTruthy();
    expect(screen.queryByLabelText("Character map")).toBeNull();
  });
});
