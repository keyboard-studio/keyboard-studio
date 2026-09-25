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
// that suite stays undisturbed. It mounts through the same shared mock
// harness as StudioShell.test.tsx (heavy hooks / WASM / VFS kept out of the
// picture). CharacterMapPane itself is deliberately left UNMOCKED (unlike StudioShell.test.tsx's other survey
// children) because exercising the pane-swap means the real
// CharacterMapPane must actually mount; its own short-circuit branch (no
// baseIr) renders deterministically without touching lib/services.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";

// ---------------------------------------------------------------------------
// Shared StudioShell harness (test/studioShellMocks/) so we can drive the
// wizard to the "characters" step without touching WASM/VFS/CLDR. The
// carve/mechanisms/touch stubs are never reached (the tests stop at
// "characters"), but StudioShell.tsx imports those modules statically, so they
// must resolve to something lightweight.
// ---------------------------------------------------------------------------

vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/BaseResolution.tsx", () => import("./test/studioShellMocks/BaseResolution.tsx"));
vi.mock("./editors/carve/CarveGalleryV2.tsx", () => import("./test/studioShellMocks/CarveGalleryV2.tsx"));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => import("./test/studioShellMocks/MechanismGallery.tsx"));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => import("./test/studioShellMocks/TouchGallery.tsx"));
vi.mock("./editors/touchSeedSource/TouchSeedSourcePanel.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourcePanel.tsx"),
);
vi.mock("./components/UnsupportedScriptStub.tsx", () => import("./test/studioShellMocks/UnsupportedScriptStub.tsx"));
vi.mock("./components/OSKFrame.tsx", () => import("./test/studioShellMocks/OSKFrame.tsx"));
vi.mock("./components/OskModeToggle.tsx", () => import("./test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("./hooks/useKeyboardArtifact.ts", () => import("./test/studioShellMocks/idleKeyboardArtifact.ts"));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => import("./test/studioShellMocks/useWorkingCopyTransform.ts"));
vi.mock("./lib/confirmRebase.ts", () => import("./test/studioShellMocks/confirmRebase.ts"));
vi.mock("./lib/buildTouchLayoutJson.ts", () => import("./test/studioShellMocks/buildTouchLayoutJson.ts"));
vi.mock("./components/CompareScreen.tsx", () => import("./test/studioShellMocks/CompareScreen.tsx"));
vi.mock("./components/OutputScreen.tsx", () => import("./test/studioShellMocks/OutputScreen.tsx"));
vi.mock("./dashboard/DashboardView.tsx", () => import("./test/studioShellMocks/DashboardView.tsx"));
vi.mock("./lib/navigate.ts", () => import("./test/studioShellMocks/navigate.ts"));

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
