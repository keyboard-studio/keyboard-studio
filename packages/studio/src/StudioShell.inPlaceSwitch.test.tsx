// Regression test (shell level) for a confirmed, self-disclosed P0: silent
// data loss after an IN-PLACE keyboard switch via the top-bar
// `CurrentKeyboardIndicator`.
//
// THE BUG AS CONFIRMED (this test reproduces it; it does not re-investigate
// it). At the time this test was written, `StudioShell.tsx` / `switchActive
// Project.ts` had NOT yet been fixed, and running this file against that
// state produced two RED failures — verbatim:
//
//   AssertionError: expected 'Beta In-Place Keyboard' to be
//   'Beta In-Place Keyboard EDITED' // Object.is equality
//     at src/StudioShell.inPlaceSwitch.test.tsx:428
//   AssertionError: expected 'Alpha In-Place Keyboard' to be
//   'Alpha In-Place Keyboard EDITED' // Object.is equality
//     at src/StudioShell.inPlaceSwitch.test.tsx:498
//
// (both at the `expect(...Envelope.displayName).toBe(EDITED_..._LABEL)`
// line — the OLD project's on-disk record was byte-identical to its
// pre-switch snapshot at that point, GREEN as expected; the NEWLY-switched-to
// project's own record simply never received the edit at all.)
//
// The mechanism, as confirmed: `CurrentKeyboardIndicator.tsx`'s dropdown lets
// the author switch keyboards from ANY route, including while already
// sitting on `#survey` with `SurveyView` mounted. Its `handleChange` calls
// the shared `switchActiveProject()` helper (lib/switchActiveProject.ts),
// which does `resumeProject(key)` -> `pinActiveProject(key)` ->
// `navigateTo("survey")`. When the author is ALREADY on `#survey`,
// `navigateTo("survey")` sets the hash to its CURRENT value — per the WHATWG
// spec (and jsdom's implementation of it), assigning `location.hash` to the
// value it already holds fires NO `hashchange` event.
// `installDraftAutosave`'s subscription lives in a plain React ref inside
// `SurveyView` (`autosaveTeardownRef`), installed by a mount-only effect. At
// the time of the RED run above, `StudioShell`'s route-driven render had no
// OTHER signal that would remount `SurveyView` on an in-place switch, so the
// OLD subscription (still closed over the abandoned project's key, made
// inert by a PRIOR fix's orphan guard — `scheduleSave`'s
// `resolveActiveProjectKey() === projectKey` check, draftPersistence.ts) was
// all that remained subscribed, and NOTHING installed a fresh subscription
// for the newly-resumed project. Every edit made after the switch updated the
// live stores (so the UI looked perfectly normal) but was never scheduled for
// a write anywhere — silent, permanent loss the moment the tab closed.
//
// CURRENT STATUS (see the parallel fixing cycle's own commits/diff for the
// authoritative account): as of this test's last run, `stores/
// projectSwitchStore.ts` + a `key={projectSwitchGeneration}` on `SurveyView`
// in `StudioShell.tsx` + a `bump()` call from `switchActiveProject.ts` now
// force exactly the missing remount signal, and this file is GREEN. Do not
// weaken these assertions to "match" a reintroduced bug — they assert the
// CORRECT behaviour (the newly-switched-to project keeps a live autosave)
// and exist so a regression here fails loudly again.
//
// UI-DRIVING CHOICE: this test drives the REAL `CurrentKeyboardIndicator`
// dropdown (the actual top-bar control, rendered for real inside the actual
// `StudioShell`/`NavBar` tree — NOT a mock, NOT a standalone component
// mount), because the bug is specifically about what happens when THAT
// control's `onChange` fires while `SurveyView` is the ALREADY-mounted
// sibling in the SAME `StudioShell` render (`NavBar` and `{content}` are
// siblings — see StudioShell.tsx's final `return`). A standalone
// `<CurrentKeyboardIndicator />` mount (as in
// CurrentKeyboardIndicator.test.tsx) cannot reproduce this: there is no
// sibling `SurveyView` for the switch to leave behind.
//
// `lib/navigate.ts` is DELIBERATELY left unmocked, same rationale as
// StudioShell.resumeRename.test.tsx / StudioShell.switchProjects.test.tsx —
// except here the point is the OPPOSITE of those two files: we need the
// REAL "assigning the same hash value fires no hashchange" behaviour, not a
// spy that would hide it. Mocking navigate.ts here would destroy the exact
// condition under test.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState, useEffect } from "react";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "./stores/phaseBDraftStore.ts";
import { markVisited } from "./lib/firstVisit.ts";
import type { OnInstantiateCallback, Stage } from "./hooks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// Mock child survey components — copied verbatim from
// StudioShell.switchProjects.test.tsx / StudioShell.resumeRename.test.tsx, so
// SurveyView can mount and render the "identity" step (the traversal
// position a plain, freshly-instantiated project restores to) without
// touching WASM/VFS/network.
// ---------------------------------------------------------------------------

vi.mock("./survey/FlowStepHost.tsx", () => ({
  FlowStepHost: ({ flow }: { flow: { flow_id: string } }) => (
    <div data-testid={`flow-stub-${flow.flow_id}`} />
  ),
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
    Prefill: () => <div data-testid="stage-prefill" />,
    PhaseB: () => <div data-testid="stage-B" />,
    PhaseA: () => <div data-testid="stage-A" />,
    SurveyRunner: () => <div data-testid="survey-runner" />,
    extractIdentityLite: (r: unknown) => r,
    extractIdentity: () => ({}),
    extractProvenance: () => ({}),
    buildPrefillRows: () => [],
  };
});

vi.mock("./editors/panels/BaseResolution.tsx", () => ({
  BaseResolution: () => <div data-testid="stage-base" />,
}));

vi.mock("./editors/carve/CarveGallery.tsx", () => ({
  CarveGallery: () => <div data-testid="stage-carve" />,
}));

vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: () => <div data-testid="stage-mechanisms" />,
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
  TrackStep: () => <div data-testid="stage-track" />,
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

// ---------------------------------------------------------------------------
// Mock heavy hooks so WASM / VFS are never touched (same as
// StudioShell.test.tsx / StudioShell.switchProjects.test.tsx).
// ---------------------------------------------------------------------------

const artifactHoisted = vi.hoisted(() => ({
  onInstantiateRef: { current: null as OnInstantiateCallback | null },
  stageSetters: [] as Array<(s: Stage) => void>,
}));

vi.mock("./hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _base: unknown,
    _spec: unknown,
    _transform: unknown,
    onInstantiate: OnInstantiateCallback | null | undefined,
  ) => {
    artifactHoisted.onInstantiateRef.current = onInstantiate ?? null;
    const [stage, setStage] = useState<Stage>({ kind: "idle" });
    useEffect(() => {
      artifactHoisted.stageSetters.push(setStage);
      return () => {
        artifactHoisted.stageSetters = artifactHoisted.stageSetters.filter((f) => f !== setStage);
      };
    }, []);
    return { stage, retry: vi.fn(), recompile: vi.fn() };
  },
}));

vi.mock("./hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

vi.mock("./lib/confirmRebase.ts", () => ({
  instantiateFromBaseIfConfirmed: vi.fn(),
  confirmRebaseTo: vi.fn(() => true),
}));

vi.mock("./lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: () => ({ json: "{}", warnings: [] }),
}));

vi.mock("./components/CompareScreen.tsx", () => ({
  CompareScreen: () => <div data-testid="compare-screen-root">compare-screen</div>,
}));

vi.mock("./components/OutputScreen.tsx", () => ({
  OutputScreen: () => <div data-testid="output-screen-root">output-screen</div>,
}));

vi.mock("./components/WelcomeScreen.tsx", () => ({
  WelcomeScreen: () => <div data-testid="welcome-screen-root">welcome-screen</div>,
}));

vi.mock("./dashboard/DashboardView.tsx", () => ({
  FlowMapView: () => <div data-testid="flow-map-view">flow-map</div>,
}));

// ---------------------------------------------------------------------------
// Guest posture for "My keyboards"/AccountControl: signed out, empty cloud
// list — same idiom as StudioShell.switchProjects.test.tsx /
// StudioShell.resumeRename.test.tsx. `lib/navigate.ts` is DELIBERATELY left
// unmocked — see the file header above for why that is the crux, not an
// oversight.
// ---------------------------------------------------------------------------

vi.mock("./hooks/useGitHubAuth.ts", () => ({
  useGitHubAuth: vi.fn(() => ({
    status: "idle",
    token: null,
    verify: null,
    login: null,
    canSubmit: false,
    missingScopes: [],
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
  })),
}));

vi.mock("./lib/serverDraftStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/serverDraftStore.ts")>();
  return { ...actual, listServerDrafts: vi.fn(async () => []) };
});

// ---------------------------------------------------------------------------
// Import the component + real draftPersistence AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { StudioShell } from "./StudioShell.tsx";
import {
  draftKey,
  resumeProject,
  saveDraft,
  listDrafts,
  AUTOSAVE_DEBOUNCE_MS,
  DRAFT_INDEX_KEY,
  type DurableDraft,
} from "./lib/draftPersistence.ts";

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

const PROJECT_A_ID = "kbd_inplace_alpha";
const PROJECT_A_NAME = "Alpha In-Place Keyboard";
const PROJECT_B_ID = "kbd_inplace_beta";
const PROJECT_B_NAME = "Beta In-Place Keyboard";

/**
 * Seeds ONE genuinely self-consistent, standalone project — same idiom as
 * StudioShell.switchProjects.test.tsx's `instantiateAndSave`: built with the
 * real stores + the real `saveDraft` via `installDraftAutosave`'s own
 * install-time synchronous save (never a hand-rolled JSON envelope — see the
 * fixture-gotcha note in draftPersistence.test.ts).
 */
function instantiateAndSave(baseId: string, displayName: string): void {
  const base = { id: baseId, displayName, languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
  saveDraft(baseId);
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
}

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  window.location.hash = "";
});

/**
 * Drives the REAL top-bar `CurrentKeyboardIndicator` dropdown, exactly as an
 * author would: open the trigger, click the target project's option row.
 * The trigger's accessible name is fixed ("Keyboard", from
 * `aria-labelledby` -> `LABEL_ID`'s "Keyboard" label, per ARIA's
 * `aria-labelledby`-overrides-content-name rule) regardless of which
 * project is currently active, so this query is stable across the switch
 * this test performs twice (A->B and, in the mirror test, B->A).
 */
function switchViaTopBarDropdown(targetProjectLabel: string): void {
  const trigger = screen.getByRole("button", { name: "Keyboard" });
  fireEvent.click(trigger);
  const targetOption = screen.getByRole("option", { name: targetProjectLabel });
  fireEvent.click(targetOption);
}

describe("StudioShell — in-place keyboard switch while SurveyView stays mounted (confirmed P0: silent autosave loss)", () => {
  it("A -> B in place: B gains live autosave, A's own record is left untouched, neither project vanishes from the index", async () => {
    // ---- Seed two genuinely distinct, unrelated projects ----
    instantiateAndSave(PROJECT_A_ID, PROJECT_A_NAME);
    instantiateAndSave(PROJECT_B_ID, PROJECT_B_NAME);

    // Pre-state, read via the RAW index key (not listDrafts()) — listDrafts()
    // runs reconciliation internally. As of this cycle that reconciliation
    // (`reconcileProjectIndex`) is additive-only, not the destructive
    // rename-merge (that moved to boot-gated `runBootRenameReconciliation`),
    // but the raw read is still the more conservative "before" snapshot and
    // costs nothing.
    const seededIndexRaw = JSON.parse(
      localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]",
    ) as Array<{ projectKey: string }>;
    expect(seededIndexRaw.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );

    // A was the project the author was last working on — resume it (loads it
    // into the stores AND re-pins draftPersistence's own active pointer),
    // exactly as a prior session ending on A would leave things.
    expect(resumeProject(PROJECT_A_ID)).toBe(true);
    markVisited();

    // THE CRUX SETUP: mount directly on `#survey` (never routing through
    // `#profile`), so `SurveyView` mounts ONCE, for the whole test, and never
    // again. This is what makes the in-place-switch condition reproducible —
    // routing the résumé through `#profile` (as
    // StudioShell.switchProjects.test.tsx does) would make `SurveyView`
    // remount on the `#profile` -> `#survey` hashchange, installing a fresh
    // autosave for whichever project is active at THAT remount and hiding
    // this exact bug.
    window.location.hash = "#survey";

    await act(async () => {
      render(<StudioShell />);
    });
    await screen.findByTestId("stage-identity");

    // SurveyView's mount effect has now run once, installing autosave for A
    // (the project already active at mount — see StudioShell.tsx's
    // "RESTORING BOOT" mount effect). Capture A's on-disk record AFTER this
    // point (its install-time synchronous save may have rewritten `savedAt`)
    // as the true "before the switch" baseline.
    const aRawAfterMount = localStorage.getItem(draftKey(PROJECT_A_ID));
    expect(aRawAfterMount).not.toBeNull();

    // Fake timers from here on — the debounced autosave write is what this
    // test needs to control precisely. Every remaining interaction below is
    // a synchronous fireEvent/act, so nothing depends on real timers or
    // findBy*/waitFor.
    vi.useFakeTimers();

    // ---- Switch A -> B via the REAL top-bar dropdown, while already on
    // #survey with SurveyView mounted ----
    switchViaTopBarDropdown(PROJECT_B_NAME);

    // Confirm the crux actually held: still on #survey (no navigation
    // occurred because the hash never changed), and the working copy really
    // did switch to B.
    expect(window.location.hash).toBe("#survey");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(PROJECT_B_ID);

    // ---- A real edit to B's (now live) working copy ----
    const EDITED_B_LABEL = `${PROJECT_B_NAME} EDITED`;
    act(() => {
      useWorkingCopyStore.getState().setIdentity({
        keyboardId: PROJECT_B_ID,
        displayName: EDITED_B_LABEL,
      });
    });

    // Advance past the autosave debounce.
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    // ---- THE FAILING ASSERTION: B's persisted record must contain the
    // edit. Correct behaviour requires SOME live autosave subscription for B
    // to have existed to pick up the store change and write it. ----
    const bRawAfterEdit = localStorage.getItem(draftKey(PROJECT_B_ID));
    expect(bRawAfterEdit).not.toBeNull();
    const bEnvelope = JSON.parse(bRawAfterEdit!) as DurableDraft;
    expect(bEnvelope.displayName).toBe(EDITED_B_LABEL);

    // ---- GUARD (must stay GREEN — regression alarm if not): A's own
    // on-disk record must be byte-identical to what it was right after
    // mount. This is the cycle-5 orphan-subscription-becomes-inert fix
    // (draftPersistence.ts scheduleSave's `resolveActiveProjectKey() ===
    // projectKey` guard) — the OLD subscription (still closed over A) must
    // NOT have written B's live content under A's key. ----
    expect(localStorage.getItem(draftKey(PROJECT_A_ID))).toBe(aRawAfterMount);

    // ---- Neither project vanished from "My keyboards" ----
    vi.useRealTimers();
    const finalEntries = listDrafts();
    expect(finalEntries).toHaveLength(2);
    expect(finalEntries.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );
  });

  // Mirror case (symmetry matters — the abandoned-pointer mechanism that
  // produced the ORIGINAL duplicate-row defect this codebase already fixed
  // was itself direction-sensitive; a fix for A->B that silently regresses
  // B->A would be exactly that class of bug again).
  it("B -> A in place: A gains live autosave, B's own record is left untouched, neither project vanishes from the index", async () => {
    instantiateAndSave(PROJECT_A_ID, PROJECT_A_NAME);
    instantiateAndSave(PROJECT_B_ID, PROJECT_B_NAME);

    const seededIndexRaw = JSON.parse(
      localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]",
    ) as Array<{ projectKey: string }>;
    expect(seededIndexRaw.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );

    // This time B is the project the author was last working on.
    expect(resumeProject(PROJECT_B_ID)).toBe(true);
    markVisited();
    window.location.hash = "#survey";

    await act(async () => {
      render(<StudioShell />);
    });
    await screen.findByTestId("stage-identity");

    const bRawAfterMount = localStorage.getItem(draftKey(PROJECT_B_ID));
    expect(bRawAfterMount).not.toBeNull();

    vi.useFakeTimers();

    switchViaTopBarDropdown(PROJECT_A_NAME);

    expect(window.location.hash).toBe("#survey");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(PROJECT_A_ID);

    const EDITED_A_LABEL = `${PROJECT_A_NAME} EDITED`;
    act(() => {
      useWorkingCopyStore.getState().setIdentity({
        keyboardId: PROJECT_A_ID,
        displayName: EDITED_A_LABEL,
      });
    });

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    // FAILING ASSERTION (mirror): A's persisted record must contain the edit.
    const aRawAfterEdit = localStorage.getItem(draftKey(PROJECT_A_ID));
    expect(aRawAfterEdit).not.toBeNull();
    const aEnvelope = JSON.parse(aRawAfterEdit!) as DurableDraft;
    expect(aEnvelope.displayName).toBe(EDITED_A_LABEL);

    // GUARD (must stay GREEN): B's own on-disk record is untouched.
    expect(localStorage.getItem(draftKey(PROJECT_B_ID))).toBe(bRawAfterMount);

    vi.useRealTimers();
    const finalEntries = listDrafts();
    expect(finalEntries).toHaveLength(2);
    expect(finalEntries.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );
  });
});
