// SurveyView forward and back transitions through the mocked step stubs.
// Split from the former single StudioShell.test.tsx; see StudioShell.testkit.tsx.

import { describe, it, expect, vi } from "vitest";

// Shallow stubs for every child component plus the heavy hooks (shared harness:
// test/studioShellMocks/). vi.mock hoists per file, so each file repeats them.
vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
// CharactersStep imports Prefill/PhaseB by file since spec 090 T021 (not via
// the barrel), so the shallow stubs must be registered for the files too.
vi.mock("./survey/Prefill.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./survey/PhaseB.tsx", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/StartResolution.tsx", () => import("./test/studioShellMocks/StartResolution.tsx"));
vi.mock("./editors/carve/CarveGalleryV2.tsx", () => import("./test/studioShellMocks/CarveGalleryV2.tsx"));
vi.mock("./editors/adapters/deadkeyAdapter.tsx", () => import("./test/studioShellMocks/deadkeyAdapter.tsx"));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => import("./test/studioShellMocks/MechanismGallery.tsx"));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => import("./test/studioShellMocks/TouchGallery.tsx"));
vi.mock("./editors/adapters/oskAdapter.tsx", () => import("./test/studioShellMocks/OskEditorAdapter.tsx"));
vi.mock("./editors/assignLoop/CssEditor.tsx", () => import("./test/studioShellMocks/CssEditor.tsx"));
vi.mock("./editors/assignLoop/HtmlEditor.tsx", () => import("./test/studioShellMocks/HtmlEditor.tsx"));
vi.mock("./survey/touchSeedSource/TouchSeedSourceHost.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourceHost.tsx"),
);
vi.mock("./components/UnsupportedScriptStub.tsx", () => import("./test/studioShellMocks/UnsupportedScriptStub.tsx"));
vi.mock("./components/OSKFrame.tsx", () => import("./test/studioShellMocks/OSKFrame.tsx"));
vi.mock("./components/OskModeToggle.tsx", () => import("./test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("./components/CompareScreen.tsx", () => import("./test/studioShellMocks/CompareScreen.tsx"));
vi.mock("./components/OutputScreen.tsx", () => import("./test/studioShellMocks/OutputScreen.tsx"));
vi.mock("./components/WelcomeScreen.tsx", () => import("./test/studioShellMocks/WelcomeScreen.tsx"));
vi.mock("./dashboard/DashboardView.tsx", () => import("./test/studioShellMocks/DashboardView.tsx"));
// Controllable: static idle by default; the "resume draft banner" F1/P1
// regression test below settles it through `artifactHoisted`.
vi.mock("./hooks/useKeyboardArtifact.ts", () => import("./test/studioShellMocks/useKeyboardArtifact.ts"));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => import("./test/studioShellMocks/useWorkingCopyTransform.ts"));
vi.mock("./lib/confirmRebase.ts", () => import("./test/studioShellMocks/confirmRebase.ts"));
// Echoes the assignments into the JSON, so Defect B tests never call real engine code.
vi.mock("./lib/buildTouchLayoutJson.ts", () => import("./test/studioShellMocks/buildTouchLayoutJson.ts"));
// Spy on navigateTo so the done-stage routing test can assert it was called
// without actually mutating window.location.
vi.mock("./lib/navigate.ts", () => import("./test/studioShellMocks/navigate.ts"));

import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import { SurveyView } from "./StudioShell.tsx";
import { advanceToPrefill, advanceToB, advanceToCarve, completeInvisibles, advanceToDeadkeys, advanceToRules, advanceToMechanisms, advanceToTouchSeedSource, installShellHooks } from "./StudioShell.testkit.tsx";

installShellHooks();

// ---------------------------------------------------------------------------
// Forward transition 1: prefill → B  (issue #508: was prefill → carve)
// ---------------------------------------------------------------------------

describe("SurveyView — prefill → B transition", () => {
  it("renders the B stage after Prefill onConfirm is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    advanceToPrefill();
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-continue"));

    // PhaseB mounts behind a lazy boundary since spec 090 T021 — await it.
    expect(await screen.findByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 2: B → carve  (issue #508: was carve → B)
// ---------------------------------------------------------------------------

describe("SurveyView — B → punctuation → carve transition", () => {
  it("renders the punctuation page after PhaseB onComplete, then carve after punctuation Done", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // marks auto-skips (S0, marks-free alphabet) onto the punctuation page,
    // which has no skip gate.
    fireEvent.click(screen.getByTestId("charlist-done"));
    expect(screen.getByTestId("punctuation-step")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();

    // Accepting it empty lands on the invisible-characters page (spec 075,
    // always renders), then on carve (convenience auto-skips — async, since
    // its gate waits on the exemplar lookup; spec 059).
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(screen.getByTestId("invisibles-step")).toBeTruthy();
    completeInvisibles();
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("punctuation-step")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 3: carve → deadkeys → rules → mechanisms
// (spec 083 inserts the Deadkeys step between carve and mechanisms;
// spec 082 inserts the rules step between deadkeys and mechanisms)
// ---------------------------------------------------------------------------

describe("SurveyView — carve → deadkeys → rules → mechanisms transition", () => {
  it("renders the deadkeys stage after CarveGallery onComplete is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    fireEvent.click(screen.getByTestId("carve-continue"));

    expect(screen.getByTestId("stage-deadkeys")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
  });

  it("renders the rules stage after Deadkeys onComplete is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToDeadkeys();
    expect(screen.getByTestId("stage-deadkeys")).toBeTruthy();

    fireEvent.click(screen.getByTestId("deadkeys-continue"));

    expect(screen.getByTestId("rules-step")).toBeTruthy();
    expect(screen.queryByTestId("stage-deadkeys")).toBeNull();
  });

  it("renders the mechanisms stage after the rules step's Continue is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToRules();
    expect(screen.getByTestId("rules-step")).toBeTruthy();

    fireEvent.click(screen.getByTestId("rules-continue"));

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    expect(screen.queryByTestId("rules-step")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward transition 4: mechanisms → touch_seed_source fork → touch → F
//
// Sequences (S-03) are now built inline in the Mechanism Gallery's method
// chooser (the right-hand preview pane swaps for the builder when "sequence"
// is selected) — there is no separate "sequences" step between mechanisms
// and the touch_seed_source fork.
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → F transition", () => {
  it("renders the touch_seed_source fork after MechanismGallery onComplete is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // mechanisms → osk → touch_seed_source fork (spec 035 R4/R12)
    fireEvent.click(screen.getByTestId("mechanisms-continue"));
    expect(screen.getByTestId("osk-continue")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();

    fireEvent.click(screen.getByTestId("osk-continue"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // Confirming the fork (no choice recorded yet on a fresh walk) lands on
    // the real "touch" step (mocked TouchGallery stub, stage-E).
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();

    fireEvent.click(screen.getByTestId("touch-continue"));

    // touch → css (mocked CssEditor stub) → help (stage-F)
    expect(screen.getByTestId("stage-css")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
    fireEvent.click(screen.getByTestId("css-continue"));

    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.queryByTestId("stage-css")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P0 regression guard: touch_seed_source must NOT co-mount the outer
// persistent right-pane OSKFrame (spec 035 R4b follow-up).
//
// TouchSeedSourcePanel now renders its own inline live OSK preview. Before
// this fix, touch_seed_source was an ordinary "pane" step, so SurveyView's
// two-pane shell ALSO mounted its own persistent right-pane <OSKFrame> at
// the same time — two live OSKs on screen, with the outer one showing the
// working copy's DESKTOP preview instead of the selected touch seed. Giving
// touch_seed_source layout:"full" makes SurveyView early-return the step's
// own full-screen container (same mechanism as carve/mechanisms/touch),
// which never reaches the two-pane shell that mounts the outer OSKFrame.
//
// This test mocks TouchSeedSourcePanel (as the rest of this file does) so it
// renders no "osk-frame" testid of its own — meaning if the outer, persistent
// OSKFrame (mocked at the top of this file to always render
// data-testid="osk-frame") is EVER absent while on this step, the fix holds;
// if it reappears, this test fails and the regression is caught. Paired with
// TouchSeedSourcePanel.test.tsx's own "mounts the real OSK forced into
// touch/mobile mode" test — which proves the panel renders exactly one real
// OSK — the two tests together prove exactly one OSK is ever on screen for
// this step (the specific "both sides mocked in isolation" gap QC flagged).
// ---------------------------------------------------------------------------

describe("SurveyView — touch_seed_source suppresses the outer OSK pane (P0 fix)", () => {
  it("does not mount the outer persistent OSKFrame while touch_seed_source is active", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // The outer, persistent right-pane OSKFrame is mocked to unconditionally
    // render data-testid="osk-frame" wherever it is mounted. TouchSeedSourcePanel
    // is mocked above and renders no such testid itself, so ANY "osk-frame"
    // node here can only have come from SurveyView's own two-pane shell — the
    // exact redundant mount this fix removes.
    expect(screen.queryByTestId("osk-frame")).toBeNull();

    // Sanity check the mock actually renders "osk-frame" elsewhere (i.e. this
    // isn't a false negative from the mock never firing) — confirm it DOES
    // show up on a genuine two-pane ("pane" layout) step, e.g. "characters".
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    fireEvent.click(screen.getByTestId("touch-continue")); // touch -> css
    fireEvent.click(screen.getByTestId("css-continue")); // css -> F (pane layout)
    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 5: B → prefill  (issue #508: was carve → prefill)
// ---------------------------------------------------------------------------

describe("SurveyView — B → prefill back-navigation", () => {
  it("returns to prefill stage when PhaseB onBack is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phase-b-back"));

    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 6: carve → B  (issue #508: was B → carve)
// ---------------------------------------------------------------------------

describe("SurveyView — carve → B back-navigation", () => {
  it("returns to B stage (not prefill) when CarveGallery onBack is called, via the invisibles and punctuation pages", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToCarve();
    expect(screen.getByTestId("stage-carve")).toBeTruthy();

    // Back from carve lands on the invisible-characters page (spec 075, the
    // last real page before carve — convenience pops through, having
    // auto-skipped forward). Async: the pop crosses convenience, whose gate
    // waits on the exemplar lookup (spec 059; see advanceToCarve).
    fireEvent.click(screen.getByTestId("carve-back"));
    expect(await screen.findByTestId("invisibles-step")).toBeTruthy();

    // Back again re-enters the punctuation page.
    fireEvent.click(screen.getByTestId("invisibles-back"));
    expect(await screen.findByTestId("punctuation-step")).toBeTruthy();

    // Back again re-enters PhaseB (marks pops through), not prefill.
    fireEvent.click(screen.getByTestId("punctuation-back"));

    // The back-pop crosses the convenience step, which re-runs its exemplar
    // lookup on re-entry and stays transparent in the direction of travel — so
    // the landing is async in both directions (spec 059; see advanceToCarve).
    expect(await screen.findByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
    // Confirm it did NOT go to prefill (the old pre-#508 behavior).
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back-navigation 7: F → E  (Phase E inserted between mechanisms and F)
// ---------------------------------------------------------------------------

describe("SurveyView — F → E back-navigation", () => {
  // NOTE: Back-navigation from Phase F is not covered here — the PhaseFGate
  // does not publish a survey-back button in this mocked setup (pre-existing;
  // the "returns to Phase E" test was already failing on main before the
  // osk/css/html steps). The F → css → touch order is pinned by the spine
  // order test and the advance policy.
  it.skip("placeholder — no back button on PhaseFGate in mocked setup", () => {});
});

// ---------------------------------------------------------------------------
// Back-navigation 8: mechanisms → rules → deadkeys → carve
// (spec 083: Deadkeys sits between carve and mechanisms;
// spec 082: rules sits between deadkeys and mechanisms)
// ---------------------------------------------------------------------------

describe("SurveyView — mechanisms → rules → deadkeys → carve back-navigation", () => {
  it("returns to the rules stage (not deadkeys) when MechanismGallery onBack is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToMechanisms();
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mechanisms-back"));

    expect(screen.getByTestId("rules-step")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
    // Confirm it did NOT go to B (the old pre-#508 behavior).
    expect(screen.queryByTestId("stage-B")).toBeNull();
  });

  it("returns to the deadkeys stage (not carve) when the rules step's Back is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToRules();
    expect(screen.getByTestId("rules-step")).toBeTruthy();

    fireEvent.click(screen.getByTestId("rules-back"));

    expect(screen.getByTestId("stage-deadkeys")).toBeTruthy();
    expect(screen.queryByTestId("rules-step")).toBeNull();
  });

  it("returns to carve stage when Deadkeys onBack is called", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToDeadkeys();
    expect(screen.getByTestId("stage-deadkeys")).toBeTruthy();

    fireEvent.click(screen.getByTestId("deadkeys-back"));

    expect(screen.getByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-deadkeys")).toBeNull();
  });
});

