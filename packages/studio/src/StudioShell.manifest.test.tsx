// T029 manifest-order invariants, then the corrupted-draft rehydrate regression (kept last).
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
vi.mock("./editors/adapters/fallbackPolicyAdapter.tsx", () => import("./test/studioShellMocks/FallbackPolicyAdapter.tsx"));
vi.mock("./editors/adapters/oskAdapter.tsx", () => import("./test/studioShellMocks/OskEditorAdapter.tsx"));
vi.mock("./editors/assignLoop/CssEditor.tsx", () => import("./test/studioShellMocks/CssEditor.tsx"));
vi.mock("./editors/assignLoop/HtmlEditor.tsx", () => import("./test/studioShellMocks/HtmlEditor.tsx"));
vi.mock("./survey/languageList/LanguageListHost.tsx", () => import("./test/studioShellMocks/LanguageListHost.tsx"));
vi.mock("./survey/openWalk/MissingLettersHost.tsx", () => import("./test/studioShellMocks/OpenWalkHosts.tsx").then((m) => ({ MissingLettersHost: m.MissingLettersHost })));
vi.mock("./survey/openWalk/UpgradesHost.tsx", () => import("./test/studioShellMocks/OpenWalkHosts.tsx").then((m) => ({ UpgradesHost: m.UpgradesHost })));
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
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { SurveyView } from "./StudioShell.tsx";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { saveDraft, loadDraft, deriveProjectKeyFromWorkingCopy } from "./lib/draftPersistence.ts";
import { manifest, screenGates } from "./steps/manifest.ts";
import { STEP_TRAILS } from "./steps/stepOrder.ts";
import * as StudioShellModule from "./StudioShell.tsx";
import { advanceToAttributionAdapt, advanceToB, completeInvisibles, advanceToMechanisms, installShellHooks } from "./StudioShell.testkit.tsx";

installShellHooks({ warmLazySteps: true });

// ---------------------------------------------------------------------------
// T029 — manifest-driven invariants (M1, FR-009)
// ---------------------------------------------------------------------------
//
// These tests assert:
//   1. No SurveyStage union symbol exists in the runtime module.
//   2. The survey advances through steps in manifest order.
//   3. applyStepCompletion is called (side effects fire) for mechanisms/touch.

describe("T029 — no SurveyStage union in SurveyView module (M1, FR-009)", () => {
  it("StudioShell module does not export a SurveyStage symbol", () => {
    // SurveyStage was the retired union type. After T028 it must not exist as
    // a named export or as an identifiable runtime value.
    const exports = Object.keys(StudioShellModule);
    expect(exports).not.toContain("SurveyStage");
  });

  // The spine order is not pinned here: steps/manifest.test.ts checks the manifest
  // against the derived screens, the first and last step, and the ordering rules
  // that matter.

  it("project_name is a derived side trail (gated) rejoining the next spine step after it (M4b, P0 fix)", () => {
    const projName = manifest.find((s) => s.id === "project_name");
    expect(projName).toBeDefined();
    // Spec 091 T014/T015: steps no longer carry gatedBy — the gate is the
    // derived screen gate published as screenGates by steps/manifest.ts.
    expect(screenGates.get("project_name")).toBeDefined();
    const after = manifest.slice(manifest.findIndex((s) => s.id === "project_name") + 1);
    const join = after.find((s) => STEP_TRAILS.get(s.id)?.spine !== false);
    expect(STEP_TRAILS.get("project_name")).toEqual({ spine: false, joinTarget: join?.id });
  });

  it("manifest has exactly one lock:physical and one lock:touch, in that order (M3)", () => {
    const locks = manifest
      .filter((s) => s.lock !== undefined)
      .map((s) => ({ id: s.id, lock: s.lock }));
    expect(locks).toHaveLength(2);
    expect(locks[0]).toMatchObject({ lock: "physical" });
    expect(locks[1]).toMatchObject({ lock: "touch" });
  });

  it("touch_seed_source is a derived side trail (gated) rejoining at 'touch' (M4)", () => {
    const seedSource = manifest.find((s) => s.id === "touch_seed_source");
    expect(seedSource).toBeDefined();
    // Spec 091 T014/T015: the gate is the derived screen gate (screenGates).
    expect(screenGates.get("touch_seed_source")).toBeDefined();
    expect(STEP_TRAILS.get("touch_seed_source")).toEqual({ spine: false, joinTarget: "touch" });
  });

  it("all manifest step ids are unique (M5)", () => {
    const ids = manifest.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("T029 — runtime step order matches manifest spine order", () => {
  it("survey advances: identity → choose_base → attribution (#1901) → project_name (copy, side trail) → characters (prefill) → B → marks (S0 auto-skip) → carve → deadkeys → rules → mechanisms → fallback_policy → osk → touch → help", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // identity (manifest step)
    expect(screen.getByTestId("stage-identity")).toBeTruthy();

    // → layout (manifest step, spec 076 A4: the community-layout question)
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("layout-step")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();

    // → choose_base (manifest step: base picker only)
    fireEvent.click(screen.getByTestId("layout-continue"));
    expect(screen.getByTestId("stage-base")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();

    // → attribution (manifest step, #1901: author/copyright — the track
    // is recorded by the start screen, or defaults to copy). Preview then
    // confirm — two separate clicks (preview-before-commit).
    fireEvent.click(screen.getByTestId("base-preview"));
    fireEvent.click(screen.getByTestId("base-confirm"));
    expect(screen.getByTestId("stage-attribution")).toBeTruthy();
    expect(screen.queryByTestId("stage-base")).toBeNull();

    // → project_name (manifest step: gated side trail, copy-track CYOA fork)
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-project-name")).toBeTruthy();
    expect(screen.queryByTestId("stage-attribution")).toBeNull();

    // → characters / prefill sub-stage (project_name rejoins at "characters")
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    // → characters / B sub-stage (FR-012: characters before carve)
    fireEvent.click(screen.getByTestId("prefill-continue"));
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // → marks (next spine step after characters, spec 071) → punctuation.
    // The test alphabet has no marks, so the S0 gate auto-completes the marks
    // step without rendering; the punctuation page has no gate and renders.
    fireEvent.click(screen.getByTestId("charlist-done"));
    expect(screen.getByTestId("punctuation-step")).toBeTruthy();

    // → invisibles (next spine step after punctuation, spec 075). Always
    // renders (no gate); the walk accepts it empty.
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(screen.getByTestId("invisibles-step")).toBeTruthy();

    // → carve (convenience auto-skips: nothing to ask on the test walk, but its
    // gate waits on the exemplar lookup — spec 059 — so the landing is async).
    completeInvisibles();
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();

    // → deadkeys (spec 083: between carve and mechanisms)
    fireEvent.click(screen.getByTestId("carve-continue"));
    expect(screen.getByTestId("stage-deadkeys")).toBeTruthy();

    // → rules (spec 082: the rules step sits between deadkeys and mechanisms)
    fireEvent.click(screen.getByTestId("deadkeys-continue"));
    expect(await screen.findByTestId("rules-step")).toBeTruthy();

    // → mechanisms
    fireEvent.click(screen.getByTestId("rules-continue"));
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // → fallback_policy (#2539: keyboard-wide policy after mechanisms, before OSK)
    fireEvent.click(screen.getByTestId("mechanisms-continue"));
    expect(screen.getByTestId("fallback-policy-continue")).toBeTruthy();

    // → osk (the OSK editor step sits after fallback_policy)
    fireEvent.click(screen.getByTestId("fallback-policy-continue"));
    expect(screen.getByTestId("osk-continue")).toBeTruthy();

    // → touch_seed_source fork (stage-seed-source; spec 035 R4/R12, no choice recorded yet)
    fireEvent.click(screen.getByTestId("osk-continue"));
    expect(screen.getByTestId("stage-seed-source")).toBeTruthy();

    // touch_seed_source → touch (side-trail rejoin hop; mocked TouchGallery stub, stage-E)
    fireEvent.click(screen.getByTestId("seed-source-confirm"));
    expect(screen.getByTestId("stage-E")).toBeTruthy();

    // → css (mocked CssEditor stub, stage-css)
    fireEvent.click(screen.getByTestId("touch-continue"));
    expect(screen.getByTestId("stage-css")).toBeTruthy();

    // → help (stage-F)
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(screen.getByTestId("stage-F")).toBeTruthy();
  });

  it("adapt-track skips project_name (side trail) and lands on characters via attribution (P0 fix, #1901)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // The adapt track is recorded by the start screen's Open entry, before
    // the walk reaches the attribution fork (see advanceToAttributionAdapt:
    // recorded between the base preview and confirm, so the identity-first
    // screens are already walked and the Open gates don't skip them).
    advanceToAttributionAdapt();
    expect(screen.getByTestId("stage-attribution")).toBeTruthy();

    // adapt-track: the fork now leaves from attribution (#1901) —
    // nextMainLineStepAfter("attribution") skips project_name (side trail).

    // Spec 111: adapt is Open, so the language list comes next, then Letters and the
    // Mechanisms gallery (a non-basic keyboard), then the on-screen keyboard; the
    // character survey is hidden on Open, and project-name never shows.
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-open-languages")).toBeTruthy();
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-open-missing-letters")).toBeTruthy();
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mechanisms-continue"));
    expect(screen.getByTestId("stage-fallback_policy")).toBeTruthy();
    fireEvent.click(screen.getByTestId("fallback-policy-continue"));
    expect(screen.getByTestId("stage-osk")).toBeTruthy();
    expect(screen.queryByTestId("stage-prefill")).toBeNull();
    expect(screen.queryByTestId("stage-project-name")).toBeNull();
  });

  it("characters step comes BEFORE carve in the manifest (FR-012)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    advanceToB();
    expect(screen.getByTestId("stage-B")).toBeTruthy();

    // charlist-done must land on carve (via the marks step's S0 auto-skip
    // — the marks-free test alphabet completes marks without rendering — and
    // the ungated punctuation and invisibles pages, both accepted empty).
    fireEvent.click(screen.getByTestId("charlist-done"));
    fireEvent.click(screen.getByTestId("punctuation-done"));
    completeInvisibles();
    expect(await screen.findByTestId("stage-carve")).toBeTruthy();
    expect(screen.queryByTestId("stage-mechanisms")).toBeNull();
  });

  it("applyStepCompletion fires lockDesktop when mechanisms completes (R1)", async () => {
    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    await advanceToMechanisms();

    // lockDesktop should not have been called yet.
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);

    // Fire mechanisms-continue — applyStepCompletion('mechanisms', ...) must call lockDesktop().
    fireEvent.click(screen.getByTestId("mechanisms-continue"));

    // lockDesktop effect: desktopLocked becomes true.
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: rehydrating a corrupted persisted draft must not runaway-render
// (freeze report filed against commit b7c9a2c, "sanitize persisted step
// history so Back never resurfaces the Phase F gate").
//
// Placed LAST in this file deliberately: draftPersistence.wasDraftRestoredThisBoot()
// is a module-level flag that flips false -> true on the first successful
// loadDraft() and never resets (see draftPersistence.ts / draftPersistence.test.ts's
// own ordering note) — a successful loadDraft() here would otherwise make every
// SurveyView mount in a LATER test skip its own mount-time reset(), which is
// exactly the kind of ordering hazard draftPersistence.test.ts already
// documents. No test after this one depends on a fresh reset.
// ---------------------------------------------------------------------------

describe("rehydrate of a corrupted persisted draft does not runaway-render (freeze regression)", () => {
  it("loadDraft() + mounting SurveyView on a stale-help-in-history record notifies a bounded number of times and leaves history reference-stable", async () => {
    // Build a legitimately-walked position via real instantiate + advance(),
    // then corrupt `history` exactly the way an OLDER, pre-P0-fix build would
    // have persisted it: a stale "help" entry left behind while activeStepId
    // is anywhere other than "done" (see surveySessionStore.ts's
    // sanitizeHistory doc comment for the corruption class this repairs).
    const fakeIr = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: fakeIr,
    });
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("attribution");
    useSurveySessionStore.getState().advance("characters");
    useSurveySessionStore.getState().advance("marks");
    useSurveySessionStore.getState().advance("carve");
    useSurveySessionStore.setState({
      activeStepId: "mechanisms",
      history: [...useSurveySessionStore.getState().history, "help"],
    });

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    saveDraft(projectKey!);

    // Cold reset — simulate a fresh page boot with nothing live to inherit from.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    // Count every notification the survey-session store fires from the start
    // of rehydrate onward. A runaway render/setState loop shows up here as an
    // unbounded (or very large) count within this synchronous test; a correct,
    // idempotent rehydrate + mount fires only a handful of times.
    let notifyCount = 0;
    const unsubscribe = useSurveySessionStore.subscribe(() => {
      notifyCount += 1;
    });

    expect(loadDraft(projectKey!)).toBe(true);
    // Sanitized immediately at rehydrate — "help" never resurfaces live.
    expect(useSurveySessionStore.getState().history).not.toContain("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");

    const historyAfterLoad = useSurveySessionStore.getState().history;

    // Mount the real component tree on top of the rehydrated state, exactly
    // as main.tsx -> StudioShell would on a real boot. If rehydrate (or any
    // effect it triggers) forms a render -> setState -> render cycle, this
    // either hangs (test times out) or notifyCount grows unboundedly.
    await act(async () => {
      render(<><SurveyView startKeyboard={basicKbdus} /><ActiveStepNav /></>);
    });

    expect(screen.getByTestId("stage-mechanisms")).toBeTruthy();

    // Idempotence / reference-stability invariant: having already been
    // sanitized once, the live history must not have been reallocated again
    // by mount, and total store churn must stay small and bounded.
    expect(useSurveySessionStore.getState().history).toBe(historyAfterLoad);
    expect(notifyCount).toBeLessThan(10);

    unsubscribe();
  });

  it("resuming directly AT the real (unmocked) PhaseFGate after rehydrate does not runaway-render", async () => {
    // Second real-code-path scenario: unlike the "mechanisms" case above
    // (where PhaseFGate never mounts), this resumes with activeStepId ===
    // "help" itself, so the actual PhaseFGate wrapper (ConfirmDialog +
    // backToUnfinishedGallery wiring) is on-screen and exercised, not just
    // the mocked step body inside it.
    const fakeIr = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: fakeIr,
    });
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("attribution");
    useSurveySessionStore.getState().advance("characters");
    useSurveySessionStore.getState().advance("marks");
    useSurveySessionStore.getState().advance("carve");
    useSurveySessionStore.getState().advance("mechanisms");
    useSurveySessionStore.setState({ activeStepId: "help" });

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    saveDraft(projectKey!);

    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    let notifyCount = 0;
    const unsubscribe = useSurveySessionStore.subscribe(() => {
      notifyCount += 1;
    });

    expect(loadDraft(projectKey!)).toBe(true);
    expect(useSurveySessionStore.getState().activeStepId).toBe("help");

    await act(async () => {
      render(<><SurveyView startKeyboard={basicKbdus} /><ActiveStepNav /></>);
    });

    // PhaseFGate's wrapped step body renders (empty confirmedInventory means
    // the coverage gate is unblocked, so the ConfirmDialog stays closed and
    // "stage-F" is what's visible).
    expect(screen.getByTestId("stage-F")).toBeTruthy();
    expect(notifyCount).toBeLessThan(10);

    unsubscribe();
  });
});

