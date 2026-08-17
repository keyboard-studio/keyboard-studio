// Regression test for the km-triage (PR #1642) coverage gap: after #1451's
// consolidation, the cloud-resume banner (ResumeDraftBanner rendered from
// SurveyView's `cloudResume` state) is the ONLY surviving resume affordance,
// but no test anywhere actually clicked its Resume/Discard buttons — the
// describe block colocated in StudioShell.test.tsx ("StudioShell — silent
// boot restore (no local resume banner)") only asserts the banner's ABSENCE
// for the silent local-restore case (see that file's header comment: "see the
// cloud-restore tests colocated with that flow" — a forward reference to
// tests that did not yet exist).
//
// This file supplies those tests: a signed-in author with a server-backed
// draft and no local trace of it on this browser sees the banner, clicking
// Resume fetches the full envelope and applies it via the REAL
// `applyRemoteDraft` (lib/draftPersistence.ts — not mocked), and clicking
// Discard drops the server draft and dismisses the banner without touching
// the working copy.
//
// Mocking strategy: the same child-component/hook stub set as
// StudioShell.resumeRename.test.tsx / StudioShell.bareReload.test.tsx (so
// SurveyView can mount past "identity" without touching WASM/VFS/network),
// with ONE deviation from those files' guest posture: `useGitHubAuth` returns
// a signed-in token here, since the cloud-restore check
// (StudioShell.tsx's `cloudRestoreCheckedRef` effect) is a no-op for a guest.

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
// Signed-in posture (the one deliberate deviation from the guest-posture
// sibling files): the cloud-restore check is a no-op without an access token.
// ---------------------------------------------------------------------------

// The token object is a STABLE reference (hoisted once, not recreated per
// render) — the cloud-restore check effect below depends on `[githubToken]`,
// and a fresh object literal on every `useGitHubAuth()` call would re-run
// that effect's cleanup (`cancelled = true`) on every re-render, racing the
// in-flight `loadServerDraftMeta` promise before it can ever resolve.
const authHoisted = vi.hoisted(() => ({
  token: { accessToken: "test-access-token", tokenType: "bearer", scope: "repo" },
}));

vi.mock("./hooks/useGitHubAuth.ts", () => ({
  useGitHubAuth: vi.fn(() => ({
    status: "verified",
    token: authHoisted.token,
    verify: null,
    login: "test-user",
    canSubmit: true,
    missingScopes: [],
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
  })),
}));

const serverDraftHoisted = vi.hoisted(() => ({
  loadServerDraftMeta: vi.fn(),
  loadServerDraftContent: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

vi.mock("./lib/serverDraftStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/serverDraftStore.ts")>();
  return {
    ...actual,
    listServerDrafts: vi.fn(async () => []),
    loadServerDraftMeta: serverDraftHoisted.loadServerDraftMeta,
    loadServerDraftContent: serverDraftHoisted.loadServerDraftContent,
    clearServerDraft: serverDraftHoisted.clearServerDraft,
  };
});

// ---------------------------------------------------------------------------
// Import the component + real draftPersistence AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import { StudioShell } from "./StudioShell.tsx";
import {
  saveDraft,
  draftKey,
  resolveActiveProjectKey,
  PENDING_PROJECT_KEY,
  type DurableDraft,
} from "./lib/draftPersistence.ts";
import type { ServerDraftMeta } from "./lib/serverDraftStore.ts";

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

const REMOTE_PROJECT_ID = "cloud_resume_project";

/**
 * Builds a REAL, well-formed `DurableDraft` envelope (via the real stores +
 * `saveDraft`, same idiom as draftPersistence.test.ts's G-1/G-5 round-trip
 * test) representing a server-backed draft with NO local trace on this
 * browser: the envelope is captured, then its local record is removed and the
 * stores are reset to a pristine boot state before the test proceeds.
 */
function buildRemoteEnvelope(): DurableDraft {
  const base = { id: REMOTE_PROJECT_ID, displayName: "Cloud Resume Test", languages: ["en"] } as unknown as BaseKeyboard;
  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });

  saveDraft(REMOTE_PROJECT_ID);
  const stored = localStorage.getItem(draftKey(REMOTE_PROJECT_ID));
  expect(stored).not.toBeNull();
  const envelope = JSON.parse(stored!) as DurableDraft;

  // No local trace: this is what makes it a CLOUD-only draft.
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();

  return envelope;
}

function serverMetaFor(envelope: DurableDraft): ServerDraftMeta {
  return {
    savedAt: envelope.savedAt,
    activeStepId: envelope.traversal.activeStepId,
    label: envelope.displayName,
    keyboardId: REMOTE_PROJECT_ID,
    schemaVersion: envelope.version,
    draftId: REMOTE_PROJECT_ID,
    status: "draft",
    prUrl: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  window.location.hash = "";
  serverDraftHoisted.loadServerDraftMeta.mockReset();
  serverDraftHoisted.loadServerDraftContent.mockReset();
  serverDraftHoisted.clearServerDraft.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  window.location.hash = "";
});

describe("StudioShell — cloud-resume banner Resume/Discard (km-triage PR #1642 gap)", () => {
  it("Resume fetches the full envelope, applies it via the real applyRemoteDraft, and dismisses the banner", async () => {
    const envelope = buildRemoteEnvelope();
    serverDraftHoisted.loadServerDraftMeta.mockResolvedValue(serverMetaFor(envelope));
    serverDraftHoisted.loadServerDraftContent.mockResolvedValue(envelope);
    markVisited();

    await act(async () => {
      render(<StudioShell />);
    });

    const banner = await screen.findByTestId("resume-draft-banner");
    expect(banner.getAttribute("data-source")).toBe("cloud");
    expect(serverDraftHoisted.loadServerDraftMeta).toHaveBeenCalledWith(
      "test-access-token",
      PENDING_PROJECT_KEY,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("resume-draft"));
      // Flush the loadServerDraftContent().then(...) microtask.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(serverDraftHoisted.loadServerDraftContent).toHaveBeenCalledWith(
      "test-access-token",
      PENDING_PROJECT_KEY,
    );

    // applyRemoteDraft is the REAL function — this is the actual effect firing,
    // not a mock assertion.
    const wc = useWorkingCopyStore.getState();
    expect(wc.instantiationMode).toBe("new-from-base");
    expect(wc.baseKeyboard?.id).toBe(REMOTE_PROJECT_ID);
    // handleResumeDraft first pins the active pointer to the draftId it
    // FETCHED with (the reserved pending slot, since nothing was locally
    // active), but its own `promotePendingAutosave()` call (F6 fix) then
    // re-derives the REAL project key from the just-restored working copy and
    // re-installs autosave under it — whose synchronous install-time save
    // re-pins the active pointer to that real key. That final state, not the
    // transient pending one, is what a real Resume click leaves behind.
    expect(resolveActiveProjectKey()).toBe(REMOTE_PROJECT_ID);

    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
  });

  it("Discard clears the server draft and dismisses the banner without touching the working copy", async () => {
    const envelope = buildRemoteEnvelope();
    serverDraftHoisted.loadServerDraftMeta.mockResolvedValue(serverMetaFor(envelope));
    markVisited();

    await act(async () => {
      render(<StudioShell />);
    });

    await screen.findByTestId("resume-draft-banner");

    await act(async () => {
      fireEvent.click(screen.getByTestId("discard-draft"));
    });

    expect(serverDraftHoisted.clearServerDraft).toHaveBeenCalledWith(
      "test-access-token",
      PENDING_PROJECT_KEY,
    );
    // loadServerDraftContent/applyRemoteDraft never ran on the Discard path.
    expect(serverDraftHoisted.loadServerDraftContent).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();

    expect(screen.queryByTestId("resume-draft-banner")).toBeNull();
  });
});
