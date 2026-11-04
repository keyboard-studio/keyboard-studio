// SurveyView done navigation, Track 2 (adapt) routing and Phase E assignments.
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
vi.mock("./survey/touchSeedSource/TouchSeedSourceHost.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourceHost.tsx"),
);
vi.mock("./editors/adapters/oskAdapter.tsx", () => import("./test/studioShellMocks/oskAdapter.tsx"));
vi.mock("./editors/assignLoop/CssEditor.tsx", () => import("./test/studioShellMocks/CssEditor.tsx"));
vi.mock("./editors/assignLoop/HtmlEditor.tsx", () => import("./test/studioShellMocks/HtmlEditor.tsx"));
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
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { touchEAssignments } from "./test/studioShellMocks/TouchGallery.tsx";
import { SurveyView } from "./StudioShell.tsx";
import { navigateTo } from "./lib/navigate.ts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { advanceToTrack, completeInvisibles, advanceToMechanisms, advanceToTouchSeedSource, advanceToF, installShellHooks } from "./StudioShell.testkit.tsx";

installShellHooks({ warmLazySteps: true });

// ---------------------------------------------------------------------------
// StudioShell / SurveyView — done stage calls navigateTo('output')
// ---------------------------------------------------------------------------

describe("SurveyView — PhaseF done navigates to #output", () => {
  it("calls navigateTo('output') when PhaseF onComplete fires", async () => {
    window.location.hash = "#survey";

    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToF();
    expect(screen.getByTestId("stage-F")).toBeTruthy();

    // Fire PhaseF completion.
    await act(async () => {
      fireEvent.click(screen.getByTestId("survey-advance"));
    });

    // navigateTo should have been called with 'output'.
    expect(navigateTo).toHaveBeenCalledWith("output");
  });
});

// ---------------------------------------------------------------------------
// Back from Phase E (touch) returns to the touch_seed_source chooser
// (spec 035 R12 re-entry path) — NOT directly to mechanisms.
// ---------------------------------------------------------------------------

describe("SurveyView — Phase E back-navigation returns to touch_seed_source (R12)", () => {
  it("onBack passed to TouchGallery sets stage to touch_seed_source, not mechanisms", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Advance to the fork, confirm it, then reach Phase E (touch).
    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Click the back button in the Phase E mock.
    fireEvent.click(screen.getByTestId("touch-back"));

    // Should resurface the seed-source chooser (R12), NOT mechanisms directly.
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    expect(screen.queryByTestId("stage-E")).toBeNull();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });

  it("the chooser's own Back reaches osk (the step genuinely visited immediately before touch_seed_source)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToTouchSeedSource();
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    fireEvent.click(screen.getByTestId("touch-back"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // The chooser's own Back pops walked history to the osk step (mechanisms →
    // osk → touch_seed_source).
    fireEvent.click(screen.getByTestId("seed-source-back"));

    expect(screen.getByTestId("stage-osk")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();
  });

  it("after returning to the fork from E, can re-confirm to reach E again", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Advance to Phase E.
    await advanceToTouchSeedSource();
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // Go back — lands on the seed-source chooser (R12), not mechanisms.
    fireEvent.click(screen.getByTestId("touch-back"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // Re-confirm — reaches Phase E again.
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    expect(screen.queryByTestId("stage-seed-source")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Track 2 (Adapt) routing — issue #388
// ---------------------------------------------------------------------------
//
// The Track 2 path clicks "track-adapt" instead of "track-copy", which skips
// the project-name step and calls instantiateFromExisting (not instantiateFromStart).
//
// useKeyboardArtifact is mocked to return { stage: { kind: "idle" } } which means
// onInstantiate never fires in this shallow test. We can still verify the ROUTING
// shape (which stage the wizard advances to, and that instantiationMode stays null
// because the mock onInstantiate never fires). A deeper integration test would
// require a real VFS/IR compile cycle — that belongs in a separate integration test.
//
// What this test covers:
//   - Clicking "track-adapt" advances to "attribution" (#1901: author/
//     copyright are asked after the track choice, on both tracks), and
//     from there to "prefill" (skips project-name).
//   - The project-name stage is NOT rendered on the adapt path.
//   - After clicking track-adapt, instantiationMode remains null (onInstantiate
//     never fires in this mock — the routing test confirms stage progression, not
//     store instantiation, which is covered exhaustively in workingCopyStore.test.ts).

describe("SurveyView — Track 2 (adapt) routing", () => {
  it("clicking track-adapt advances through attribution to prefill, skipping project-name", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Drive to the track stage.
    advanceToTrack();
    expect(screen.getByTestId("stage-track")).toBeTruthy();

    // Click adapt (Track 2).
    fireEvent.click(screen.getByTestId("track-adapt"));

    // Should be at attribution (#1901), not project-name.
    expect(screen.getByTestId("stage-attribution")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
    expect(screen.queryByTestId("stage-track")).toBeNull();

    // Advance through attribution to prefill.
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
  });

  it("track-copy still advances through attribution and project-name to prefill (regression guard)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    advanceToTrack();
    fireEvent.click(screen.getByTestId("track-copy"));

    // Should be at attribution first (#1901), not project-name yet.
    expect(screen.getByTestId("stage-attribution")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();

    // Advance through attribution to project-name.
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-project-name")).toBeTruthy();

    // Advance through project-name.
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adapt-track SC-002 walk — mirrors the copy-track carve->B back-navigation test
// ---------------------------------------------------------------------------
//
// SC-002 requires BOTH tracks walked through to carve, including back-from-carve
// landing on PhaseB. This test proves the adapt-track path (which skips
// project_name) converges on the same carve-back behavior as the copy-track path.

describe("SurveyView — adapt-track carve → B back-navigation (SC-002 parity)", () => {
  it("adapt-track: selects adapt → skips project_name → prefill-continue → stage-B → charlist-done → punctuation → carve → back-backs land on stage-B (not prefill)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Drive to track stage, then select adapt (skips project_name).
    advanceToTrack();
    fireEvent.click(screen.getByTestId("track-adapt"));

    // Adapt-track lands on attribution (#1901), then prefill (no
    // project-name).
    expect(screen.getByTestId("stage-attribution")).toBeTruthy();
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();

    // Confirm prefill → PhaseB visible.
    fireEvent.click(screen.getByTestId("prefill-continue"));
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // Advance through PhaseB (and the ungated punctuation and invisibles
    // pages) to carve — the landing is async (see advanceToCarve).
    fireEvent.click(screen.getByTestId("charlist-done"));
    fireEvent.click(screen.getByTestId("punctuation-done"));
    completeInvisibles();
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();

    // carve-back lands on the invisible-characters page (spec 075, the last
    // real page before carve — convenience pops through, having auto-skipped
    // forward).
    fireEvent.click(screen.getByTestId("carve-back"));
    expect(screen.getByTestId("invisibles-step")).toBeTruthy();

    // invisibles-back re-enters the punctuation page.
    fireEvent.click(screen.getByTestId("invisibles-back"));
    expect(screen.getByTestId("punctuation-step")).toBeTruthy();

    // punctuation-back must re-enter PhaseB (not prefill) — marks pops through.
    fireEvent.click(screen.getByTestId("punctuation-back"));

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(screen.queryByTestId("stage-carve")).toBeNull();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defect B regression — handlePhaseEComplete applies assignments to output
// ---------------------------------------------------------------------------
//
// handlePhaseEComplete must call setTouchLayoutJson with JSON derived from
// buildTouchLayoutJson(startIr, assignments, opts) — NOT scaffoldTouchLayout(ir)
// with the assignments ignored. We seed startIr into the store, emit a
// longpress assignment from the TouchGallery mock, and assert the stored
// touchLayoutJson contains the assignment data.
//
// Spec 035 R11 update: emission is no longer gated on "assignments non-empty"
// alone — the three rows below pin the matrix: import-adapt + a real edit
// emits; import-adapt + no edit + empty mods emits nothing; reseed-from-
// desktop ALWAYS emits, even with zero edits.

describe("SurveyView — handlePhaseEComplete applies assignments to output (Defect B)", () => {
  it("import-adapt + a real edit: setTouchLayoutJson is called with JSON containing the emitted assignment", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Seed startIr into the store so handlePhaseEComplete can call buildTouchLayoutJson.
    // The mock buildTouchLayoutJson serialises its `assignments` arg into the JSON,
    // so we can assert the round-trip without touching real engine code.
    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Set the assignments the TouchGallery mock will emit when touch-continue fires.
    // A longpress of "ä" on K_A is the canonical Defect B example.
    const longpressAssignment = {
      scope: "individual" as const,
      target: "ä",
      modality: "touch" as const,
      mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "ä" } }],
      source: "user" as const,
    };
    touchEAssignments.current = [longpressAssignment];

    // Navigate through the fork, then fire the TouchGallery complete button.
    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-continue"));
    // The touch_seed_source chooser is shown next (spec 035 R4/R12, no choice
    // recorded on a fresh walk) — NOT the real "touch" step, so
    // applyStepCompletion("touch") has not fired yet.
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-confirm"));
    });
    // Confirming the fork lands on the real touch step and triggers
    // buildTouchLayoutJson on completion.
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-continue"));
    });

    // The mock buildTouchLayoutJson encodes the assignments into the JSON.
    // Verify the stored touchLayoutJson contains the assignment target "ä".
    const stored = useWorkingCopyStore.getState().touchLayoutJson;
    expect(stored).not.toBeNull();
    expect(stored).toContain("longpress_alternates");
    expect(stored).toContain("K_A");
  });

  it("baseIr null: setTouchLayoutJson(null) regardless of seedSource (the one gate the reducer still owns)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // startIr is null — store is not seeded. handlePhaseEComplete must call
    // setTouchLayoutJson(null) rather than attempting to build a layout.
    touchEAssignments.current = [];

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-continue"));

    // Confirming touch_seed_source (spec 035 R4/R12 fork; no choice recorded
    // on a fresh walk) lands on the real "touch" step; completing it fires
    // applyStepCompletion("touch").
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-confirm"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-continue"));
    });

    // Store startIr is null → touchLayoutJson must remain null.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("import-adapt + no edits + empty mods: setTouchLayoutJson(null) (truly-untouched no-op)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // Seed startIr so the branch condition is clear: assignments empty → null,
    // regardless of startIr presence.
    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Empty assignments — no real touch edits were made.
    touchEAssignments.current = [];

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-continue"));

    // Confirming touch_seed_source (spec 035 R4/R12 fork; no choice recorded
    // on a fresh walk) lands on the real "touch" step; completing it fires
    // applyStepCompletion("touch").
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-confirm"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-continue"));
    });

    // No real edits → touchLayoutJson must be null so serializeWorkingCopy
    // leaves the VFS untouched and KMW uses its native default.
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("reseed-from-desktop: setTouchLayoutJson is called (non-null) even with zero Phase E edits", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    const fakeIr = makeTestIR([]);
    act(() => {
      useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: fakeIr,
      });
    });

    // Zero Phase E edits — the row that would emit nothing under import-adapt.
    touchEAssignments.current = [];

    await advanceToMechanisms();
    fireEvent.click(screen.getByTestId("mechanisms-continue"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // Pick "Reseed from desktop" instead of the default import-adapt button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("seed-source-reseed-complete"));
    });
    expect(screen.getByTestId("stage-E")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-continue"));
    });

    // R11: reseed-from-desktop ALWAYS emits (SC-002) — the mocked
    // buildTouchLayoutJson always returns non-null JSON, so a non-null stored
    // value here proves the emission gate let the build through.
    expect(useWorkingCopyStore.getState().touchLayoutJson).not.toBeNull();
  });
});
