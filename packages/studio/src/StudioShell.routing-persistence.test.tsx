// StudioShell routing, first-visit gates, silent boot restore and F6 autosave promotion.
// Split from the former single StudioShell.test.tsx; see StudioShell.testkit.tsx.

import { describe, it, expect, afterEach, vi } from "vitest";

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
import { useDecisionStore } from "./stores/decisionStore.ts";
import { useStartOverStore } from "./stores/startOverStore.ts";
import { type Stage } from "./hooks/useKeyboardArtifact.ts";
import { artifactHoisted } from "./test/studioShellMocks/useKeyboardArtifact.ts";
import { SurveyView, StudioShell } from "./StudioShell.tsx";
import { markVisited } from "./lib/firstVisit.ts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { instantiateFromStartIfConfirmed, confirmRebaseTo } from "./lib/confirmRebase.ts";
import { saveDraft, loadDraft, deriveProjectKeyFromWorkingCopy, draftKey, PENDING_PROJECT_KEY, AUTOSAVE_DEBOUNCE_MS, setActiveProjectKey, resolveActiveProjectKey, type DurableDraft } from "./lib/draftPersistence.ts";
import { installShellHooks } from "./StudioShell.testkit.tsx";

const instantiateSpy = instantiateFromStartIfConfirmed as ReturnType<typeof vi.fn>;
const confirmRebaseToSpy = confirmRebaseTo as ReturnType<typeof vi.fn>;

installShellHooks();

// ---------------------------------------------------------------------------
// StudioShell routing regression — #preview mounts CompareScreen and #output
// mounts OutputScreen (distinct screens, NOT RoutePlaceholder).
// ---------------------------------------------------------------------------

describe("StudioShell — route: #preview renders CompareScreen", () => {
  // Spec 057: the route TOKEN stays `preview` while the tab is labelled
  // "Compare" (contract §1), so this hash assertion is deliberately unchanged.
  it("mounts CompareScreen (not RoutePlaceholder) when hash is #preview", async () => {
    window.location.hash = "#preview";
    localStorage.setItem("ks.visited", "1"); // returning visitor: deep-link hash is honored

    await act(async () => {
      render(<StudioShell />);
    });

    // CompareScreen stub must be present.
    expect(screen.getByTestId("compare-screen-root")).toBeTruthy();
    // OutputScreen must NOT be present — these are distinct screens.
    expect(screen.queryByTestId("output-screen-root")).toBeNull();
    // RoutePlaceholder renders a "coming soon" stub; must NOT be present.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

describe("StudioShell — route: #output renders OutputScreen", () => {
  it("mounts OutputScreen (not RoutePlaceholder) when hash is #output", async () => {
    window.location.hash = "#output";
    localStorage.setItem("ks.visited", "1"); // returning visitor: deep-link hash is honored

    await act(async () => {
      render(<StudioShell />);
    });

    // OutputScreen stub must be present.
    expect(screen.getByTestId("output-screen-root")).toBeTruthy();
    // CompareScreen must NOT be present — these are distinct screens.
    expect(screen.queryByTestId("compare-screen-root")).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

describe("StudioShell — first-visit gate forces newcomers to welcome", () => {
  it("forces WelcomeScreen for a never-visited browser arriving on a deep-linked #preview hash", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // pristine browser: never visited

    await act(async () => {
      render(<StudioShell />);
    });

    // The deep-linked #preview is overridden — a genuine newcomer lands on
    // welcome (the shallow WelcomeScreen stub above, per this file's routing-
    // test idiom).
    expect(screen.queryByTestId("compare-screen-root")).toBeNull();
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    // The hash is rewritten to #welcome so leaving welcome fires a real hashchange.
    expect(window.location.hash).toBe("#welcome");
  });

  it("honors the deep-linked hash once the browser has visited", async () => {
    window.location.hash = "#preview";
    localStorage.setItem("ks.visited", "1"); // returning visitor

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("compare-screen-root")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StudioShell first-visit landing gate (proposal §9). With no explicit hash:
//   • a true first-time visitor lands on the WelcomeScreen;
//   • a returning visitor (ks.visited) or one with a resumable draft skips
//     welcome and lands in the survey.
// An explicit valid hash (#preview/#output/#survey) wins for a RETURNING
// visitor or once a resumable draft exists — see the route regressions above
// (both now set ks.visited to represent that case). A genuine first-time
// visitor (never visited, no draft) always lands on WelcomeScreen first, even
// on a deep-linked hash — see the two tests below.
// ---------------------------------------------------------------------------

describe("StudioShell — first-visit landing gate", () => {
  // Seeds the ONE draft engine's scheme (lib/draftPersistence.ts, #1451) —
  // a `ks.draft.<key>.v1` record plus the `ks.draft.active` pointer —
  // directly, bypassing saveDraft()'s VR-2 "no real work" guard the same way
  // the inner describe blocks below do.
  function seedResumableDraft() {
    const projectKey = PENDING_PROJECT_KEY;
    const savedAt = Date.now();
    localStorage.setItem(
      draftKey(projectKey),
      JSON.stringify({
        version: 1,
        savedAt,
        projectKey,
        displayName: null,
        languageTag: null,
        // A pending-slot (pre-instantiation) record's workingCopy is always a
        // full snapshot object with `instantiationMode: null` — never a bare
        // `null` — mirroring what `snapshotWorkingCopyData()` actually
        // produces (see loadDraftMeta's/loadDraft's shared VR-2 tolerance).
        workingCopy: { instantiationMode: null },
        traversal: { activeStepId: "identity", history: [] },
      }),
    );
    setActiveProjectKey(projectKey);
  }

  it("mounts WelcomeScreen (not the survey) on a first visit with no hash", async () => {
    window.location.hash = "";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    // The survey wizard's first step must NOT be present.
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("falls back to WelcomeScreen for an unknown hash on a first visit", async () => {
    window.location.hash = "#does-not-exist";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
  });

  it("skips welcome and lands on the New-or-Open choice for a returning visitor with no draft", async () => {
    window.location.hash = "";
    localStorage.clear();
    localStorage.setItem("ks.visited", "1"); // browser has entered the app before

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("start-new")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("skips welcome and lands in the survey when a resumable draft exists", async () => {
    window.location.hash = "";
    localStorage.clear();
    // A minimally-valid draft (version + savedAt + survey) so loadDraftMeta()
    // returns non-null; the survey route surfaces the resume banner.
    seedResumableDraft();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("forces WelcomeScreen for a first-time visitor arriving on a deep-linked #survey hash", async () => {
    window.location.hash = "#survey";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("forces WelcomeScreen for a first-time visitor arriving on a deep-linked #preview hash", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("compare-screen-root")).toBeNull();
  });

  it("routes the welcome screen's Privacy link to the privacy notice, not the survey", async () => {
    window.location.hash = "";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();

    // WelcomeScreen is stubbed here, so drive PrivacyLink's own sequence
    // (PrivacyScreen.test pins it): mark the visit, then set #privacy. The
    // hash must parse to the privacy route — an unparsed token falls through
    // to the (now "survey") landing route and opens the identity step instead.
    await act(async () => {
      markVisited();
      window.location.hash = "#privacy";
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(screen.getByTestId("privacy-screen")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("lifts the gate on a live hashchange once the newcomer leaves welcome (no remount)", async () => {
    window.location.hash = "#survey";
    localStorage.clear(); // pristine browser: never visited, no draft

    await act(async () => {
      render(<StudioShell />);
    });

    // A newcomer is forced onto welcome even on a deep-linked #survey hash, and
    // that hash is normalized to #welcome. Without this normalization the
    // WelcomeScreen "Continue as guest" button's navigateTo("survey") would be a
    // same-value hash assignment that fires zero hashchange events, soft-locking
    // the user on welcome.
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(window.location.hash).toBe("#welcome");

    // Leaving welcome marks the browser visited; the button then navigates to
    // #survey. Drive that live transition on the SAME mount: the gate must lift
    // and the route re-resolve to survey on the next hashchange, WITHOUT the
    // component remounting (the test never re-renders StudioShell).
    await act(async () => {
      markVisited();
      window.location.hash = "#survey";
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(screen.getByTestId("stage-identity")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
  });

  it("honors a deep-linked #preview hash for a never-visited browser once a resumable draft exists", async () => {
    window.location.hash = "#preview";
    localStorage.clear(); // never visited...
    // ...but a resumable draft lifts the newcomer gate. Same minimally-valid
    // draft shape used by the "resumable draft exists" test above.
    seedResumableDraft();

    await act(async () => {
      render(<StudioShell />);
    });

    // Gate lifted by the draft ⇒ the deep-linked hash is honored: land on
    // preview, NOT forced onto welcome and NOT defaulted to survey.
    expect(screen.getByTestId("compare-screen-root")).toBeTruthy();
    expect(screen.queryByTestId("welcome-screen-root")).toBeNull();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StudioShell — silent boot restore, no local resume banner (#1451).
//
// #1451 consolidated the two draft engines: lib/draftPersistence.ts (silent
// boot-time restore, `ks.draft.*`) is now the ONE engine, and the second,
// independently-debounced local engine (lib/draftAutosave.ts, `ks.studio.*`,
// with its own "Resume?" banner) is retired. `ResumeDraftBanner.tsx` is now
// offered ONLY for a signed-in author's server-backed cloud draft (a
// genuinely different browser/device with no local trace) — see the
// "cloud-restore" tests colocated with that flow; there is nothing left here
// to seed a LOCAL banner from, because the local resume path never renders
// one any more, structurally, not just by a suppression guard.
//
// Pattern audit (sweep-pattern, invoked before this rewrite): the shape here
// is "layer-confusion (Layer A emitting style, Layer B blocking compile)" —
// no, not applicable; the actual class matched is closest to "a second 300ms
// debounce timer" (two independent engines racing over the same authoring
// state) per CLAUDE.md's shaped-bug list. Sibling sites swept and fixed in
// this same change: StudioShell.tsx (banner + both autosave/cloud-sync
// effects), ResumeDraftBanner.tsx (local-vs-cloud offer), switchActiveProject.ts
// + CurrentKeyboardIndicator.tsx (the second active-project pointer),
// serverDraftStore.ts + draftTypes.ts (the second server payload shape),
// surveySessionStore.ts + persistWorkingCopy.ts (comments/dead exports whose
// sole caller was the retired engine). One regression test per sibling site
// was not applicable here (deleting a whole engine removes the site rather
// than leaving a fixed one behind); the tests below instead lock the
// resulting invariant — silent restore, no local banner, ever — as a class.
// ---------------------------------------------------------------------------

describe("StudioShell — silent boot restore (no local resume banner)", () => {
  /**
   * Mirrors main.tsx's pre-mount silent restore exactly (main.tsx itself
   * isn't imported by this test file): resolve the active project, then
   * `loadDraft()` it into the stores, BEFORE StudioShell ever renders.
   */
  function seedAndSilentlyRestore(projectKey: string) {
    const activeKey = resolveActiveProjectKey();
    expect(activeKey).toBe(projectKey);
    expect(loadDraft(activeKey!)).toBe(true);
  }

  // F1/P1 regression (was "résumé pre-seeds instantiatedForStartIdRef"):
  // the SAME invariant now holds structurally off the silent boot-restore
  // effect (StudioShell.tsx, the `restoredProjectKey !== null` branch) rather
  // than off a banner click — a compile-pipeline settle for the
  // already-restored base must not re-run doCommit (no second
  // instantiateFromStartIfConfirmed call) or pop the rebase-confirm dialog.
  it("a pipeline settle for the silently-restored base does not re-instantiate or confirm", async () => {
    window.location.hash = "";
    localStorage.clear();

    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: makeTestIR([]),
    });
    useSurveySessionStore.getState().setLocalStart(basicKbdus);
    useSurveySessionStore.getState().setStartConfirmed(true);
    useSurveySessionStore.getState().advance("choose_base");

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    saveDraft(projectKey!);

    // The top-level stores are no longer needed for this test and must not
    // leak into later tests in this file.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    seedAndSilentlyRestore(projectKey!);

    await act(async () => {
      render(<StudioShell />);
    });

    // No banner — restored silently. Sanity: the restored base is on screen.
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    expect(screen.getByTestId("stage-base")).toBeTruthy();

    // Simulate the compile pipeline settling AGAIN for the restored base
    // (e.g. Track 1's setScaffoldSpec() triggering a second compile run) —
    // fires onInstantiate then transitions the artifact stage to "ready",
    // mirroring the real pipeline's run() ordering.
    act(() => {
      artifactHoisted.onInstantiateRef.current?.(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: basicKbdus.id,
        } as unknown as Stage);
      }
    });

    expect(instantiateSpy).not.toHaveBeenCalled();
    expect(confirmRebaseToSpy).not.toHaveBeenCalled();
  });

  // F5-shaped-bug regression, now a structural-impossibility test rather than
  // a guard test: the retired engine's storage keyspace (`ks.studio.*`) is
  // simply never read by anything any more. Seeding STALE data there
  // (mirroring the pre-#1451 "coarser debounce lagging one step behind"
  // symptom exactly) must have ZERO effect — not "suppressed by a freshness
  // check", but inert, because there is only one engine and one keyspace left
  // to read from.
  it("stale data left behind under the retired engine's storage keyspace has no effect on the silently-restored session", async () => {
    window.location.hash = "";
    localStorage.clear();

    // Reach an L4-equivalent position (base confirmed, track chosen, on the
    // characters/prefill step) via the top-level stores.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
      vfs: createVirtualFS([]),
      ir: makeTestIR([]),
    });
    // The derived identity result must be non-null in the snapshot: the
    // restored CharactersStep renders null (its prefill guard) without it.
    // Spec 089: that means the identity decisions are recorded.
    {
      const record = useDecisionStore.getState().record;
      record({ id: "language-name", value: "English", provenance: "asked" });
      record({ id: "language-autonym", value: "English", provenance: "asked" });
      record({ id: "language-code", value: "en", provenance: "asked" });
      record({ id: "target-script", value: "Latn", provenance: "asked" });
    }
    useSurveySessionStore.getState().setLocalStart(basicKbdus);
    useSurveySessionStore.getState().setStartConfirmed(true);
    useSurveySessionStore.getState().advance("choose_base");
    useSurveySessionStore.getState().advance("track");
    useSurveySessionStore.getState().advance("characters");

    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(projectKey).not.toBeNull();
    // The FRESH snapshot, via the ONE engine — this is what main.tsx's
    // silent boot restore will apply.
    saveDraft(projectKey!);

    // Stale data under the RETIRED engine's own (now nonexistent-as-code)
    // storage scheme — nothing reads these keys any more; this is orphaned
    // data a pre-#1451 build could have left behind, not a live keyspace.
    localStorage.setItem("ks.studio.activeProject", projectKey!);
    localStorage.setItem(
      `ks.studio.project.${projectKey}`,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        survey: {
          activeStepId: "track",
          identityResult: null,
          scaffoldSpec: null,
          history: ["identity", "choose_base"],
        },
        workingCopy: null,
      }),
    );
    localStorage.setItem(
      "ks.studio.projects.index",
      JSON.stringify([
        {
          projectKey,
          savedAt: Date.now(),
          activeStepId: "track",
          label: null,
          langTag: null,
          status: "draft",
          prUrl: null,
        },
      ]),
    );

    // Top-level stores are no longer needed for this test and must not leak
    // into later tests in this file.
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    seedAndSilentlyRestore(projectKey!);

    await act(async () => {
      render(<StudioShell />);
    });

    // No banner, ever — there is no local-draft offer surface any more.
    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
    // The correctly-restored step (characters/prefill) is on screen, NOT the
    // stale "track" step the retired engine's orphaned data names.
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-track")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F6 wiring regression (docs/design-notes/switch-base-popup-behavior-log.md):
// `promotePendingAutosave` (private to SurveyView) is exercised here through
// its three real call sites — doCommit (base confirm), the self-promote edge
// case, and handleStartOver's re-arm — rather than unit-tested directly,
// since it is not exported. Drives the real `installDraftAutosave`/
// `saveDraft`/`clearDraft` machinery in `lib/draftPersistence.ts` (NOT
// mocked in this file) against real localStorage, mirroring the F5 test
// above.
// ---------------------------------------------------------------------------
describe("F6 wiring: promotePendingAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) confirming a base promotes the pending autosave: the pending record is cleared and the real project key's record is written", async () => {
    localStorage.clear();

    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    // L1 progress: survey-advance gives hasMeaningfulProgress() a true reading
    // (identityResult !== null / activeStepId !== "identity").
    fireEvent.click(screen.getByTestId("survey-advance"));
    fireEvent.click(screen.getByTestId("layout-continue")); // spec 076 A4 layout step

    // Seed a REAL pending-slot record (as the mount-time autosave's own
    // debounced write would eventually do) so its removal below is an
    // observable state change, not a no-op on an absent key.
    saveDraft(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    // Preview the (mocked) base — sets localStart, arming the commit button.
    fireEvent.click(screen.getByTestId("base-preview"));

    // Drive the compile pipeline settle for that SAME base id ("basic_kbdus",
    // the mock's fakeStart — matches basicKbdus.id) and manually instantiate
    // the working copy, since `instantiateFromStartIfConfirmed` is mocked to a
    // no-op for every test in this file (see the module-level vi.mock above) —
    // doCommit's own body does not depend on that mock actually instantiating;
    // it only needs a real working copy in place to derive a real project key.
    act(() => {
      useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
      });
      artifactHoisted.onInstantiateRef.current?.(basicKbdus, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: basicKbdus.id,
        } as unknown as Stage);
      }
    });

    // Spec 092 FR-004: doCommit now also waits for the authoring-track
    // decision (the setup decision's second input, recorded by the track
    // step's completion in production) — record it before confirming.
    act(() => {
      useDecisionStore.getState().record({
        id: "authoring-track",
        value: "copy",
        provenance: "asked",
      });
    });

    // Commit — fires doCommit → promotePendingAutosave.
    fireEvent.click(screen.getByTestId("base-confirm"));

    const realKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(realKey).toBe(basicKbdus.id);

    // The pending record is gone (item 1's index gating is orthogonal — this
    // is the RECORD, not the index row).
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBeNull();
    // installDraftAutosave's own synchronous install-time save (P1 fix) means
    // a record for the real key exists immediately, with no debounce wait.
    const stored = localStorage.getItem(draftKey(realKey!));
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored!) as DurableDraft).projectKey).toBe(realKey);
  });

  it("(b) self-promote: when the derived project key IS the pending key, the pending record survives (clearDraft is not reached)", async () => {
    localStorage.clear();
    // A base whose id is literally the reserved sentinel — a synthetic
    // edge case (never true of a real keyboard id) constructed purely to
    // force `deriveProjectKeyFromWorkingCopy` to resolve to the pending key
    // at the moment doCommit runs, so the `projectKey !== PENDING_PROJECT_KEY`
    // guard's FALSE branch is the one under test.
    const pendingIdBase = { ...basicKbdus, id: PENDING_PROJECT_KEY };

    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    fireEvent.click(screen.getByTestId("survey-advance"));
    fireEvent.click(screen.getByTestId("layout-continue")); // spec 076 A4 layout step
    saveDraft(PENDING_PROJECT_KEY);
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    act(() => {
      // Bypasses the mock StartResolution's hardcoded fakeStart id (fixed at
      // "basic_kbdus") — setLocalStart directly, matching the real
      // StartResolutionAdapter.onPreview effect.
      useSurveySessionStore.getState().setLocalStart(pendingIdBase);
      useWorkingCopyStore.getState().instantiateFromStart(pendingIdBase, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
      });
      artifactHoisted.onInstantiateRef.current?.(pendingIdBase, {
        vfs: createVirtualFS([]),
        ir: makeTestIR([]),
        removalCapabilities: new Map(),
      });
      for (const setStage of artifactHoisted.stageSetters) {
        setStage({
          kind: "ready",
          compileResult: {},
          jsBlobUrl: "blob:test",
          vfs: createVirtualFS([]),
          scaffoldWarnings: [],
          keyboardId: pendingIdBase.id,
        } as unknown as Stage);
      }
    });

    fireEvent.click(screen.getByTestId("base-confirm"));

    const realKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    expect(realKey).toBe(PENDING_PROJECT_KEY);

    // Self-promote: installDraftAutosave(PENDING_PROJECT_KEY) re-runs (its own
    // synchronous save rewrites the SAME record), but `clearPersistenceDraft`
    // must never fire for this branch — the record is present, not removed.
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();
  });

  it("(c) start-over re-arms the pending autosave: new L1 progress after reset is persisted under the pending key again", async () => {
    localStorage.clear();
    vi.useFakeTimers();

    await act(async () => {
      render(<><SurveyView startKeyboard={null} /><ActiveStepNav /></>);
    });

    fireEvent.click(screen.getByTestId("survey-advance"));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();

    // Start over. The Reset control itself now lives in the NavBar (out of this
    // SurveyView-only render), so fire the handler SurveyView publishes for it
    // — which also proves the startOverStore bridge is live on mount.
    const startOver = useStartOverStore.getState().handler;
    expect(startOver).not.toBeNull();
    act(() => {
      startOver!();
    });

    // handleStartOver's discardActiveDraft() removes the just-abandoned
    // pending record synchronously.
    expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBeNull();
    expect(screen.getByTestId("stage-identity")).toBeTruthy();

    // New L1 progress in this SAME mount, after the reset — only possible if
    // handleStartOver actually re-armed the pending-slot autosave
    // subscription (autosaveTeardownRef.current =
    // installDraftAutosave(DRAFT_PERSISTENCE_PENDING_KEY)); without that
    // re-arm this subscription would still be torn down from the reset and
    // this progress would go unpersisted until the NEXT base confirm.
    fireEvent.click(screen.getByTestId("survey-advance"));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    const stored = localStorage.getItem(draftKey(PENDING_PROJECT_KEY));
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored!) as DurableDraft).traversal.activeStepId).toBe("layout");
  });
});

