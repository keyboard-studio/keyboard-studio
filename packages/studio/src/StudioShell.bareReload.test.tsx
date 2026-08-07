// Regression test for the reload path StudioShell.resumeRename.test.tsx does
// NOT cover: a project whose stored `identity.keyboardId !== baseKeyboard.id`
// (a completed mid-session rename), restored via the BOOT path — `main.tsx`'s
// pre-mount `loadDraft(resolveActiveProjectKey())` call — with NO Resume
// click anywhere.
//
// This matters because `loadDraft()` and `resumeProject()` are NOT the same
// primitive: `resumeProject` calls `loadDraft` AND THEN re-pins the active
// pointer (`setActiveProjectKey`) on success. `loadDraft` alone (what
// `main.tsx` calls before React ever mounts) never touches the active
// pointer on a successful restore — see draftPersistence.ts's `loadDraft`
// doc comment: "Load ... and rehydrate both stores" with no mention of the
// pointer, contrasted with `resumeProject`'s explicit
// `setActiveProjectKey(projectKey)` call.
//
// So on a bare reload of a renamed project, `resolveActiveProjectKey()`
// keeps naming the ORIGINAL (pre-rename) key straight through `loadDraft()`,
// and it is `installDraftAutosave`'s own key-change migration — triggered by
// SurveyView's mount effect deriving the NOW-renamed key from the
// just-restored working copy — that is solely responsible for cleaning up
// the stale original-key row. The bug report's fix claims this path is
// covered "for free" by the same mechanism the Resume-click path uses; this
// test is what actually pins that claim down.
//
// Mocking strategy and fixture-seeding idiom copied verbatim from
// StudioShell.resumeRename.test.tsx (same seedRenamedProjectDraft shape),
// with ONE deliberate deviation: instead of clicking "Resume" from #profile,
// this test calls `loadDraft()` directly — mirroring exactly what
// `main.tsx`'s `mountApp()` does before `createRoot(...).render(...)` — and
// mounts StudioShell directly on `#survey` (a bare reload lands wherever the
// browser's own persisted hash already was; no navigateTo call is involved
// on this path at all).

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState, useEffect } from "react";
import { screen, cleanup, act } from "@testing-library/react";
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
// StudioShell.resumeRename.test.tsx.
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
// Guest posture, `lib/navigate.ts` left unmocked (belt-and-suspenders — this
// test never calls navigateTo at all, but StudioShell's own internals may).
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
  loadDraft,
  resolveActiveProjectKey,
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

const BASE_ID = "basic_kbdus_reload";
const CUSTOM_ID = "my_renamed_keyboard_reload";

/**
 * Seeds exactly the state a real "author renamed mid-session" project leaves
 * behind, identical in shape to StudioShell.resumeRename.test.tsx's
 * `seedRenamedProjectDraft` — ONE "My keyboards" index row + ONE per-project
 * record filed under BASE_ID whose stored `identity.keyboardId` is already
 * CUSTOM_ID.
 */
function seedRenamedProjectDraft(): void {
  const base = { id: BASE_ID, displayName: "Base Keyboard", languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });

  const teardown = installDraftAutosave(BASE_ID);
  useWorkingCopyStore.getState().setIdentity({ keyboardId: CUSTOM_ID });
  teardown();
  const finalTeardown = installDraftAutosave(BASE_ID);
  finalTeardown();

  // Reset the LIVE stores to their pre-boot shape — a real reload starts with
  // nothing restored yet, only `ks.draft.active` + the per-project record on
  // disk.
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

describe("StudioShell — bare reload of a renamed project does not duplicate the index row (no Resume click)", () => {
  it("main.tsx's pre-mount loadDraft() + a direct #survey mount leaves exactly one 'My keyboards' entry", async () => {
    seedRenamedProjectDraft();
    markVisited();

    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0]?.projectKey).toBe(BASE_ID);

    // ---- The exact boot sequence main.tsx's mountApp() runs BEFORE React
    // ever mounts, per that file:
    //   const activeProjectKey = resolveActiveProjectKey();
    //   if (activeProjectKey !== null) loadDraft(activeProjectKey);
    // No resumeProject() call anywhere on this path — loadDraft() alone,
    // which (unlike resumeProject) never touches the active-project pointer
    // on success.
    const activeProjectKey = resolveActiveProjectKey();
    expect(activeProjectKey).toBe(BASE_ID);
    const applied = loadDraft(activeProjectKey!);
    expect(applied).toBe(true);

    // The pointer is UNCHANGED by loadDraft — still the stale, pre-rename
    // key — exactly the condition that makes installDraftAutosave's own
    // key-change migration the only thing standing between this path and a
    // duplicate row.
    expect(resolveActiveProjectKey()).toBe(BASE_ID);

    // A bare reload lands wherever the browser's own hash already was — no
    // navigateTo call, no Resume click, no #profile round trip.
    window.location.hash = "#survey";
    await act(async () => {
      render(<StudioShell />);
    });

    await screen.findByTestId("stage-identity");

    const entries = listDrafts();
    // EXPECTED (the fix's "covered for free" claim): still exactly one row,
    // now keyed on the post-rename id, with the stale BASE_ID record gone —
    // via installDraftAutosave's own migration, triggered purely by
    // SurveyView's mount effect deriving CUSTOM_ID from the loadDraft()-
    // restored working copy, with no click anywhere in this test.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(CUSTOM_ID);
    expect(localStorage.getItem(draftKey(BASE_ID))).toBeNull();

    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]") as Array<{
      projectKey: string;
    }>;
    expect(rawIndex.map((e) => e.projectKey).sort()).toEqual([CUSTOM_ID]);
  });
});
