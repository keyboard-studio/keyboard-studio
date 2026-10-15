// Preview pane suppression on the Survey steps before the base choice:
// identity and layout declare no right pane, so neither the desktop pane
// nor the mobile Preview trigger/sheet renders — even when a base already
// exists (resumed draft). choose_base keeps the preview.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import { setViewport } from "./test/viewport.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";

vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./survey/Prefill.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./survey/PhaseB.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/StartResolution.tsx", () => import("./test/studioShellMocks/StartResolution.tsx"));
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
    render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
  });
}

function setBase(): void {
  act(() => {
    useSurveySessionStore.getState().setLocalStart(basicKbdus);
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

describe("SurveyView — no preview pane on identity/layout", () => {
  it("desktop identity: no preview pane even with a base present", async () => {
    await mountAtWidth(1280);
    setBase();
    expect(screen.queryByLabelText("Keyboard preview")).toBeNull();
    expect(screen.queryByTestId("osk-frame")).toBeNull();
    expect(screen.queryByTestId("survey-show-preview")).toBeNull();
  });

  it("mobile identity: no Preview button or sheet even with a base present", async () => {
    await mountAtWidth(412);
    setBase();
    expect(screen.queryByTestId("survey-show-preview")).toBeNull();
    expect(screen.queryByTestId("survey-preview-sheet")).toBeNull();
  });

  it("mobile layout: no Preview button even with a base present", async () => {
    await mountAtWidth(412);
    // identity -> layout
    fireEvent.click(screen.getByTestId("survey-advance"));
    setBase();
    expect(screen.queryByTestId("survey-show-preview")).toBeNull();
    expect(screen.queryByTestId("survey-preview-sheet")).toBeNull();
  });

  it("desktop layout: no preview pane even with a base present", async () => {
    await mountAtWidth(1280);
    fireEvent.click(screen.getByTestId("survey-advance"));
    setBase();
    expect(screen.queryByLabelText("Keyboard preview")).toBeNull();
    expect(screen.queryByTestId("osk-frame")).toBeNull();
  });

  it("choose_base keeps the preview pane on desktop", async () => {
    await mountAtWidth(1280);
    fireEvent.click(screen.getByTestId("survey-advance"));
    fireEvent.click(screen.getByTestId("layout-continue"));
    setBase();
    expect(screen.getByLabelText("Keyboard preview")).toBeTruthy();
  });

  it("choose_base keeps the mobile Preview button when a base exists", async () => {
    await mountAtWidth(412);
    fireEvent.click(screen.getByTestId("survey-advance"));
    fireEvent.click(screen.getByTestId("layout-continue"));
    setBase();
    expect(screen.getByTestId("survey-show-preview")).toBeTruthy();
  });
});
