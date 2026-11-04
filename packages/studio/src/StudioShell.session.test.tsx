// SurveyView traversal across route round trips, start-over, deep links and footer mount.
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

import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { getDecisionSnapshot, selectTrack } from "./stores/decisionStore.ts";
import { deriveIdentityResult } from "./decisions/identitySelectors.ts";
import { useStepWalkStore } from "./stores/stepWalkStore.ts";
import { consumePendingWelcomeLocation, jumpToLocation } from "./lib/jumpToLocation.ts";
import { SurveyView, StudioShell } from "./StudioShell.tsx";
import { advanceToTrack, advanceToPrefill, installShellHooks } from "./StudioShell.testkit.tsx";

installShellHooks();

// ---------------------------------------------------------------------------
// Spec 057 US1 (T020) — traversal survives a route round trip.
//
// These tests encode the NEW contract, replacing the old "navigating away and
// back is a fresh wizard" assumption (FR-002, FR-003, D-1). They are written
// so that reinstating any mount-time reset makes them fail: each drives the
// wizard forward, unmounts and remounts SurveyView exactly as a hash-route
// change does, and asserts the traversal is where the author left it.
//
// `cleanup()` + a fresh `render()` is the right model for a route change here:
// StudioShell's route switch swaps which component the content slot renders,
// which unmounts SurveyView and mounts it again — the store singleton is what
// spans the two, and that is precisely the seam under test.
// ---------------------------------------------------------------------------

describe("SurveyView — traversal survives a route round trip (spec 057 FR-002)", () => {
  /**
   * Mount the way `StudioShell` does: `startKeyboard` is the WORKING-COPY
   * STORE's base, not a fixed prop. That matters on the remount — `SurveyView`
   * syncs `localStart` from this prop, so remounting with a hardcoded `null`
   * would blank a base the author had already chosen and tell us nothing about
   * traversal.
   */
  async function mountSurvey() {
    const base =
      useWorkingCopyStore.getState().startKeyboard ??
      useSurveySessionStore.getState().localStart;
    await act(async () => {
      render(<><SurveyView startKeyboard={base} /><ActiveStepNav /></>);
    });
  }

  /** Unmount and remount, as a tab switch away and back does. */
  async function routeRoundTrip() {
    cleanup();
    await mountSurvey();
  }

  it("keeps activeStepId and history across a remount", async () => {
    useSurveySessionStore.getState().reset();
    await mountSurvey();
    advanceToTrack();

    const before = {
      activeStepId: useSurveySessionStore.getState().activeStepId,
      history: [...useSurveySessionStore.getState().history],
    };
    expect(before.activeStepId).toBe("track");
    expect(before.history.length).toBeGreaterThan(0);

    await routeRoundTrip();

    expect(useSurveySessionStore.getState().activeStepId).toBe(before.activeStepId);
    expect([...useSurveySessionStore.getState().history]).toEqual(before.history);
  });

  it("renders the step the author left, not the first question", async () => {
    useSurveySessionStore.getState().reset();
    await mountSurvey();
    advanceToPrefill();
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();

    await routeRoundTrip();

    // The reported symptom, inverted: the prefill screen is still on screen
    // and the identity stage is not.
    expect(screen.getByTestId("stage-prefill")).toBeTruthy();
    expect(screen.queryByTestId("stage-identity")).toBeNull();
  });

  it("keeps the characters substage across a remount (D-4's antecedent)", async () => {
    useSurveySessionStore.getState().reset();
    await mountSurvey();
    advanceToPrefill();
    fireEvent.click(screen.getByTestId("prefill-continue"));
    expect(useSurveySessionStore.getState().charactersSubStage).toBe("B");

    await routeRoundTrip();

    expect(useSurveySessionStore.getState().charactersSubStage).toBe("B");
    expect(screen.getByTestId("stage-B")).toBeTruthy();
  });

  it("keeps the answers the walk recorded — the identity and track decisions (spec 089)", async () => {
    useSurveySessionStore.getState().reset();
    await mountSurvey();
    advanceToTrack();
    fireEvent.click(screen.getByTestId("track-copy"));

    // Spec 089: identity and track live in the decision store now; the
    // session fields this test used to read are deleted.
    const identityBefore = deriveIdentityResult(getDecisionSnapshot());
    const trackBefore = selectTrack(getDecisionSnapshot());
    expect(identityBefore).not.toBeNull();
    expect(trackBefore).toBe("copy");

    await routeRoundTrip();

    expect(deriveIdentityResult(getDecisionSnapshot())).toEqual(identityBefore);
    expect(selectTrack(getDecisionSnapshot())).toBe(trackBefore);
  });

  it("survives repeated round trips — the loss is not merely deferred by one", async () => {
    useSurveySessionStore.getState().reset();
    await mountSurvey();
    advanceToTrack();

    await routeRoundTrip();
    await routeRoundTrip();
    await routeRoundTrip();

    expect(useSurveySessionStore.getState().activeStepId).toBe("track");
  });
});

describe("SurveyView — a reset happens only on an explicit start-over (spec 057 FR-003)", () => {
  it("the corner reset control clears traversal back to identity", async () => {
    useSurveySessionStore.getState().reset();

    // The whole shell, not SurveyView alone: the Reset control lives in the
    // NavBar's right group and reaches SurveyView's handleStartOver through the
    // startOverStore bridge, so a SurveyView-only render has no button to click.
    // Mounting both ends is what makes this an end-to-end assertion of the
    // control rather than of the handler it happens to publish.
    window.location.hash = "#survey";
    localStorage.setItem("ks.visited", "1"); // returning visitor: no welcome gate

    await act(async () => {
      render(<StudioShell />);
    });
    advanceToTrack();
    expect(useSurveySessionStore.getState().activeStepId).toBe("track");

    // The real SurveyResetButton — arm, then confirm.
    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.click(screen.getByTestId("survey-reset-yes"));

    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
    expect(useSurveySessionStore.getState().history).toEqual([]);
    // Spec 089: start-over resets the decision store too (088 FR-007), so
    // the derived identity result is null again.
    expect(deriveIdentityResult(getDecisionSnapshot())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 057 US3 / FR-015 (T046, SC-012) — a shared deep link survives the
// first-visit gate.
//
// Defect D-9: `hashToRoute` forces a genuine newcomer onto `#welcome` and
// rewrites the address bar to match, DISCARDING whatever location was
// requested. That rewrite is load-bearing (without it, "Continue as guest"'s
// `navigateTo("survey")` would be a same-value hash assignment firing zero
// hashchange events, soft-locking the visitor on welcome), so the fix is not
// to remove it but to hold the requested location across it — see
// `setPendingWelcomeLocation` / `consumePendingWelcomeLocation` in
// lib/jumpToLocation.ts, consumed by WelcomeScreen's `leaveWelcome`.
//
// The location is consumed THROUGH `jumpToLocation`, so the ordinary
// reachability rules apply: a link naming a step of a project this visitor
// does not have degrades to the tab rather than landing them somewhere
// impossible. Both halves are asserted below.
// ---------------------------------------------------------------------------

describe("StudioShell — a first-time visitor's deep link survives the welcome gate", () => {
  it("holds a step-scoped location across the gate instead of discarding it", async () => {
    window.location.hash = "#survey/characters";
    localStorage.clear(); // pristine browser: a genuine newcomer

    await act(async () => {
      render(<StudioShell />);
    });

    // Forced onto welcome, and the hash normalized — unchanged behaviour.
    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(window.location.hash).toBe("#welcome");

    // ...but the requested location was HELD rather than dropped. Consuming it
    // is what `leaveWelcome` does; asserting it here proves the gate captured
    // it, which is the half D-9 got wrong.
    const held = consumePendingWelcomeLocation();
    expect(held).toEqual({ route: "survey", step: "characters" });
  });

  it("holds a bare route location too, so an ordinary shared #trail link is not lost", async () => {
    window.location.hash = "#trail";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(consumePendingWelcomeLocation()).toEqual({ route: "trail" });
  });

  it("holds nothing when the visitor arrived with no deep link at all", async () => {
    window.location.hash = "";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    // Nothing to honour — `leaveWelcome` falls through to the default landing,
    // exactly as before this feature.
    expect(consumePendingWelcomeLocation()).toBeNull();
  });

  it("holds nothing for a malformed hash — a parse failure is not a location", async () => {
    window.location.hash = "#survey//characters";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    expect(screen.getByTestId("welcome-screen-root")).toBeTruthy();
    expect(consumePendingWelcomeLocation()).toBeNull();
  });

  it("honours the held location on exit, subject to the ordinary reachability rules", async () => {
    // A step-scoped link with NO project instantiated degrades to the tab
    // (`no-project`) rather than landing the visitor inside a wizard that has
    // nothing to be somewhere in. That is `jumpToLocation` doing its job — the
    // gate does not get its own reachability rules (FR-015 defers to FR-013).
    window.location.hash = "#survey/characters";
    localStorage.clear();

    await act(async () => {
      render(<StudioShell />);
    });

    const held = consumePendingWelcomeLocation();
    expect(held).not.toBeNull();

    const outcome = jumpToLocation(held!);
    expect(outcome).toMatchObject({
      kind: "degraded",
      at: { route: "survey" },
      reason: "no-project",
    });
  });
});

// ---------------------------------------------------------------------------
// The journey footer is actually MOUNTED by the shell (spec 057 T052, FR-040).
//
// This gap was real: StudioFooter.a11y.test.tsx renders the component in
// isolation and e2e/footer-progress.spec.ts is outside the unit CI lane, so
// dropping `<StudioFooter />` from the shell shipped green. These two cases pin
// the mount and both sides of the revised visibility gate through the real
// shell, in the lane every PR runs.
// ---------------------------------------------------------------------------

describe("StudioShell — journey footer mount (T052, FR-040)", () => {
  it("mounts the footer on #survey once the journey has started, with no base keyboard yet", async () => {
    window.location.hash = "#survey";
    localStorage.setItem("ks.visited", "1");

    await act(async () => {
      render(<StudioShell />);
    });

    // This file mocks `survey/FlowStepHost.tsx` and `survey/index.ts`, so the
    // real SurveyRunner — the thing that publishes a walk on mount — never
    // runs here. Publish what it would publish, which is the state the shell
    // has to render correctly. (The unmocked end of this, the real runner
    // publishing `identity` at question 1, is covered by
    // StudioFooter.a11y.test.tsx's gate cases.)
    act(() => {
      useStepWalkStore
        .getState()
        .publishStepWalk("identity", [{ id: "il_language_english", done: false }]);
    });

    expect(useWorkingCopyStore.getState().startKeyboard).toBeNull();

    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelectorAll("[data-progress-dot-kind]").length).toBeGreaterThan(0);
  });

  it("does not mount the footer on the welcome screen", async () => {
    window.location.hash = "";
    localStorage.clear(); // pristine browser: the first-visit gate forces welcome

    await act(async () => {
      render(<StudioShell />);
    });

    expect(document.querySelector("footer")).toBeNull();
  });

  it("renders the skip link first, pointing at the mounted footer nav cluster", async () => {
    window.location.hash = "#survey";
    localStorage.setItem("ks.visited", "1");

    await act(async () => {
      render(<StudioShell />);
    });

    act(() => {
      useStepWalkStore
        .getState()
        .publishStepWalk("identity", [{ id: "il_language_english", done: false }]);
    });
    // The survey's StepHost publishes the identity step's nav entry on
    // mount, so the footer renders its cluster without further seeding.

    const link = screen.getByTestId("skip-to-step-navigation");
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("Skip to step navigation");
    expect(link.getAttribute("href")).toBe("#step-navigation");
    expect(link.classList.contains("ks-skip-link")).toBe(true);

    // First focusable element in the shell: nothing tabbable precedes it.
    const focusables = document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables[0]).toBe(link);

    // The target exists in the mounted footer and is the nav cluster.
    const target = document.querySelector("#step-navigation");
    expect(target).not.toBeNull();
    expect(target!.getAttribute("data-testid")).toBe("step-nav");
    expect(target!.getAttribute("tabindex")).toBe("-1");
    expect(target!.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(document.querySelector("footer")!.contains(target)).toBe(true);
  });
});
