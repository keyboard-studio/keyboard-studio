// Narrow-viewport preview trigger on the survey's characters step.
//
// At phone width the right pane (OSK preview or character map) lives in a
// PreviewSheet opened from a floating PreviewButton. These tests mount the
// real SurveyView at 412px on the characters step and check the trigger is
// present and opens the content the right pane would otherwise show.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import { setViewport } from "./test/viewport.ts";
import { advanceToCharactersStep } from "./test/advanceToCharactersStep.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";

vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
// CharactersStep imports Prefill/PhaseB by file since spec 090 T021 (not via
// the barrel), so the shallow stubs must be registered for the files too.
vi.mock("./survey/Prefill.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./survey/PhaseB.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/BaseResolution.tsx", () => import("./test/studioShellMocks/BaseResolution.tsx"));
vi.mock("./editors/carve/CarveGalleryV2.tsx", () => import("./test/studioShellMocks/CarveGalleryV2.tsx"));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => import("./test/studioShellMocks/MechanismGallery.tsx"));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => import("./test/studioShellMocks/TouchGallery.tsx"));
vi.mock("./survey/touchSeedSource/TouchSeedSourceHost.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourceHost.tsx"),
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

import { SurveyView } from "./StudioShell.tsx";

const ORIGINAL_WIDTH = window.innerWidth;

async function mountAtWidth(width: number): Promise<void> {
  setViewport(width);
  await act(async () => {
    render(<><SurveyView baseKeyboard={null} /><ActiveStepNav /></>);
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  setViewport(ORIGINAL_WIDTH);
});

describe("SurveyView — narrow preview trigger on the characters step", () => {
  it("build-list: the trigger is the character map and opens the map sheet", async () => {
    await mountAtWidth(412);
    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });

    const trigger = screen.getByTestId("survey-show-preview");
    expect(trigger.getAttribute("aria-label")).toBe("Show character map");

    fireEvent.click(trigger);
    const sheet = screen.getByTestId("survey-preview-sheet");
    expect(within(sheet).getByLabelText("Character map")).toBeTruthy();
  });

  it("build-list with no base keyboard chosen yet: the character map trigger still renders", async () => {
    await mountAtWidth(412);
    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setLocalBase(null);
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });

    expect(screen.getByTestId("survey-show-preview")).toBeTruthy();
  });

  it("intro chooser with a base chosen: the trigger opens the keyboard preview", async () => {
    await mountAtWidth(412);
    advanceToCharactersStep();
    expect(useSurveySessionStore.getState().discoveryMethod).toBeNull();

    const trigger = screen.getByTestId("survey-show-preview");
    expect(trigger.getAttribute("aria-label")).toBe("Show keyboard preview");

    fireEvent.click(trigger);
    expect(within(screen.getByTestId("survey-preview-sheet")).getByLabelText("Keyboard preview")).toBeTruthy();
  });

  it("desktop width: no trigger, the right pane shows the content inline", async () => {
    await mountAtWidth(1280);
    advanceToCharactersStep();
    act(() => {
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
    });

    expect(screen.queryByTestId("survey-show-preview")).toBeNull();
    // Reached the characters step: the map renders inline, not in a sheet.
    expect(screen.getByLabelText("Character map")).toBeTruthy();
    expect(screen.queryByTestId("survey-preview-sheet")).toBeNull();
  });
});
