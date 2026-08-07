// Regression test (shell level) for the "duplicate My keyboards row after
// Resume" defect.
//
// Reproduces the user-visible bug end to end: seed a "My keyboards" index
// with ONE row + a per-project draft record whose stored working copy has
// already drifted (identity.keyboardId !== baseKeyboard.id — a completed
// Track-1 rename, exactly what a real autosave record looks like once the
// author has picked a custom keyboard id but the record is still filed under
// the ORIGINAL base-id key — see draftPersistence.ts's
// deriveProjectKeyFromWorkingCopy doc comment). Render the real StudioShell
// on the #profile route, click Resume on that project's "My keyboards" card,
// and assert `listDrafts()` still returns exactly one entry afterward.
//
// Mechanism (see the lower-level counterpart,
// lib/draftPersistence.resumeRename.test.ts, for the same defect isolated
// without a shell mount):
//   1. MyKeyboardsList's handleResume calls resumeProject(baseId), which
//      loadDraft()s the record into the working-copy/survey-session stores —
//      the store now has identity.keyboardId = customId, baseKeyboard.id =
//      baseId — then navigates to #survey.
//   2. SurveyView mounts FRESH (it was not mounted while on #profile). Its
//      mount effect (StudioShell.tsx ~L789-802) derives the project key from
//      the JUST-RESTORED working copy (customId, not baseId) and calls
//      installDraftAutosave(customId), whose synchronous install-time save
//      (P1 fix) upserts a SECOND "My keyboards" index row under customId.
//      The original baseId row is never removed — nothing on the résumé path
//      runs doCommit's cleanup (`clearPersistenceDraft`), because
//      `instantiatedForBaseIdRef` is pre-seeded specifically to make doCommit
//      early-return.
//
// Mocking strategy: the same child-component/hook stub set as
// StudioShell.test.tsx (so SurveyView can mount past "identity" without
// touching WASM/VFS/network), MINUS that file's `lib/navigate.ts` mock — this
// test needs `navigateTo` to actually flip `window.location.hash` (its real,
// unmocked behavior) so the route genuinely switches from #profile to
// #survey and SurveyView genuinely (re)mounts, which is the crux of the
// defect. `useGitHubAuth` and `serverDraftStore` are mocked the same way
// MyKeyboardsList.test.tsx mocks them (guest / empty cloud list) so "My
// keyboards" never attempts a real network call.

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
// Mock child survey components — same shallow-stub idiom as
// StudioShell.test.tsx, trimmed to what SurveyView needs to mount and render
// the "identity" step (the traversal position our seeded draft restores to)
// without crashing.
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
// Mock heavy hooks so WASM / VFS are never touched (same as StudioShell.test.tsx).
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
// Guest posture for "My keyboards": signed out, empty cloud list — same
// idiom as MyKeyboardsList.test.tsx. `lib/navigate.ts` is DELIBERATELY left
// unmocked (see module docstring above) — this test needs the real
// window.location.hash-setting behavior.
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
  installDraftAutosave,
  listDrafts,
  DRAFT_INDEX_KEY,
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

const BASE_ID = "basic_kbdus";
const CUSTOM_ID = "my_renamed_keyboard";

/**
 * Seed exactly the state a real "author renamed mid-session" project leaves
 * behind: ONE "My keyboards" index row + ONE per-project draft record filed
 * under BASE_ID, whose stored `workingCopy.identity.keyboardId` is already
 * CUSTOM_ID — i.e. the record autosave kept writing under the ORIGINAL
 * project key even after the author picked a custom id (see
 * draftPersistence.ts's deriveProjectKeyFromWorkingCopy doc comment: the
 * derived key flips the moment identity.keyboardId is set, but nothing moves
 * an ALREADY-installed autosave subscription's closure-captured key).
 *
 * Built with the REAL stores + installDraftAutosave (not a hand-rolled JSON
 * envelope) so the seeded record is exactly as well-formed as a real one —
 * see draftPersistence.test.ts's `instantiateMinimal` for the same idiom.
 */
function seedRenamedProjectDraft(): void {
  const base = { id: BASE_ID, displayName: "Base Keyboard", languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });

  // Session 1: install autosave before identity exists — writes the ONE
  // index row + draft record under BASE_ID (deriveProjectKeyFromWorkingCopy's
  // documented pre-identity fallback).
  const teardown = installDraftAutosave(BASE_ID);

  // Author completes Track 1's identity step with a custom keyboard id
  // (TrackOneIdentityPanel -> workingCopyStore.setIdentity) — but the
  // installed autosave above is still closed over BASE_ID, so the NEXT
  // debounced/synchronous save it performs is still filed at BASE_ID's key,
  // now carrying the renamed identity in its `workingCopy` payload.
  useWorkingCopyStore.getState().setIdentity({ keyboardId: CUSTOM_ID });
  teardown();
  // Re-install under BASE_ID once more (mirrors autosave's own closure — it
  // never re-derives the key on its own) so the on-disk record reflects the
  // renamed identity while staying filed under BASE_ID, matching a real
  // in-session autosave write.
  const finalTeardown = installDraftAutosave(BASE_ID);
  finalTeardown();

  // Reset the LIVE stores to their pre-boot shape: the bug reproduces on a
  // Resume click, which is the moment loadDraft() (re-)applies the record —
  // not merely by leaving the store already instantiated from this seeding.
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
  localStorage.clear();
  window.location.hash = "";
});

describe("StudioShell — Resume from My keyboards does not duplicate the index row (bug repro)", () => {
  it("clicking Resume on a renamed project leaves exactly one 'My keyboards' entry", async () => {
    seedRenamedProjectDraft();
    markVisited(); // returning-visitor landing gate, belt-and-suspenders with loadDraftMeta()

    // Sanity: the seed left exactly the one row a real prior session would.
    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0]?.projectKey).toBe(BASE_ID);

    window.location.hash = "#profile";

    await act(async () => {
      render(<StudioShell />);
    });

    const resumeButton = await screen.findByRole("button", { name: /Resume/i });
    fireEvent.click(resumeButton);

    // Resume -> resumeProject(BASE_ID) applies the draft (identity.keyboardId
    // now CUSTOM_ID in the live store) -> navigateTo("survey") -> real
    // hashchange -> SurveyView mounts FRESH, tripping its mount effect.
    await screen.findByTestId("stage-identity");

    const entries = listDrafts();
    // EXPECTED (post-fix): still exactly one row, now keyed on the current
    // (post-rename) project id, with the stale BASE_ID record gone.
    // ACTUAL (bug): SurveyView's mount effect derives CUSTOM_ID from the
    // just-restored working copy and installDraftAutosave(CUSTOM_ID) writes
    // a SECOND row — upsertIndexEntry matches by exact projectKey, so BASE_ID's
    // row is untouched rather than replaced.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(CUSTOM_ID);
    expect(localStorage.getItem(draftKey(BASE_ID))).toBeNull();

    // Belt-and-suspenders on the raw index too (same fact, different vantage
    // point — a length-1 listDrafts() with the wrong survivor would be an
    // equally broken outcome this line would still catch).
    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]") as Array<{
      projectKey: string;
    }>;
    expect(rawIndex.map((e) => e.projectKey).sort()).toEqual([CUSTOM_ID]);
  });
});
