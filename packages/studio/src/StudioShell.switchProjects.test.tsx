// Adversarial regression test for a suspected P0: switching from one project
// to a GENUINELY DIFFERENT project (not a rename of the same project) must
// not destroy the project being switched AWAY from.
//
// This is the sibling of StudioShell.resumeRename.test.tsx, which proves the
// duplicate-row fix for a SINGLE project renamed mid-session. That fix works
// by having `installDraftAutosave` compare the project it already considered
// active (read via `resolveActiveProjectKey()` BEFORE overwriting it) against
// the project it is about to install autosave for, and — when they differ —
// treating the OLD key as a stale filing of the SAME project
// (`migrateProjectKeyIfChanged`, which unconditionally `clearDraft`s the "from"
// key).
//
// That is safe ONLY if "the project already considered active" and "the
// project about to be installed" are NEVER two unrelated projects in the real
// call sequence. `resumeProject()` (draftPersistence.ts) is supposed to
// guarantee this for a project switch specifically because it re-pins the
// active pointer to the NEW project (`setActiveProjectKey`) as part of
// applying the draft, BEFORE the next `installDraftAutosave` call (triggered
// by SurveyView's mount effect) ever reads `resolveActiveProjectKey()`. If
// that ordering is broken anywhere in the chain — `resumeProject` not
// re-pinning, or something re-pinning back to the old project first — then
// switching A -> B looks EXACTLY like a same-project rename to
// `installDraftAutosave`, and `migrateProjectKeyIfChanged` deletes A's
// record + "My keyboards" row as a "stale filing" of B. That is real user
// data loss, not a cosmetic duplicate row.
//
// Mechanism exercised end-to-end, mirroring StudioShell.resumeRename.test.tsx's
// mocking strategy exactly (same child-component stubs, same unmocked
// lib/navigate.ts so a real hashchange remounts SurveyView): seed TWO
// self-consistent, UNRELATED projects (different base ids, no rename
// involved), make A the active project, then use "My keyboards"'s Resume
// action on B — the same `resumeProject(key)` -> `navigateTo("survey")`
// contract CurrentKeyboardIndicator.tsx's top-bar switcher now also uses
// (see that component's module header: "Same contract `MyKeyboardsList.tsx`'s
// `handleResume` uses (copied verbatim...)").

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
// StudioShell.resumeRename.test.tsx, so SurveyView can mount and render the
// "identity" step (the traversal position a plain, freshly-instantiated
// project restores to) without touching WASM/VFS/network.
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
// Guest posture for "My keyboards": signed out, empty cloud list — same idiom
// as MyKeyboardsList.test.tsx / StudioShell.resumeRename.test.tsx.
// `lib/navigate.ts` is DELIBERATELY left unmocked so a real hashchange fires
// on every Resume click and SurveyView genuinely (re)mounts each time — the
// crux of what this test needs to exercise `installDraftAutosave`'s
// key-change migration for real, twice, in both directions.
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
  saveDraft,
  resumeProject,
  listDrafts,
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

const PROJECT_A_ID = "kbd_switch_alpha";
const PROJECT_A_NAME = "Alpha Keyboard";
const PROJECT_B_ID = "kbd_switch_beta";
const PROJECT_B_NAME = "Beta Keyboard";

/**
 * Seeds ONE genuinely self-consistent, standalone project — no rename
 * involved anywhere in its history, unlike seedRenamedProjectDraft() in
 * StudioShell.resumeRename.test.tsx. Built with the real stores + the real
 * `saveDraft` (never a hand-rolled JSON envelope — see the fixture-gotcha
 * note in draftPersistence.test.ts's own idiom) so the seeded record is
 * exactly as well-formed as a real one.
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
  localStorage.clear();
  window.location.hash = "";
});

describe("StudioShell — switching between two DISTINCT projects must not destroy either (suspected P0)", () => {
  it("A -> B -> A round trip via Resume preserves BOTH projects' records and content", async () => {
    // Seed two genuinely unrelated projects. Neither is a rename of the
    // other: different base ids, never sharing a `saveDraft` call, never
    // routed through `installDraftAutosave`'s migration during setup.
    instantiateAndSave(PROJECT_A_ID, PROJECT_A_NAME);
    instantiateAndSave(PROJECT_B_ID, PROJECT_B_NAME);

    const seeded = listDrafts();
    expect(seeded).toHaveLength(2);
    expect(seeded.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );

    // Make A the active project — "the author was last working on A" — via
    // the real résumé primitive (loads A into the stores AND re-pins the
    // active pointer to A), exactly as a prior session ending on A would
    // leave things.
    expect(resumeProject(PROJECT_A_ID)).toBe(true);

    markVisited();
    window.location.hash = "#profile";
    await act(async () => {
      render(<StudioShell />);
    });

    // ---- leg 1: A -> B, via "My keyboards"' Resume on B ----
    const resumeB = await screen.findByRole("button", {
      name: new RegExp(`Resume ${PROJECT_B_NAME}`, "i"),
    });
    fireEvent.click(resumeB);
    await screen.findByTestId("stage-identity");

    const afterAtoB = listDrafts();
    expect(afterAtoB.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );
    expect(afterAtoB).toHaveLength(2);
    expect(localStorage.getItem(draftKey(PROJECT_A_ID))).not.toBeNull();
    expect(localStorage.getItem(draftKey(PROJECT_B_ID))).not.toBeNull();

    const aEnvelopeAfterAtoB = JSON.parse(
      localStorage.getItem(draftKey(PROJECT_A_ID))!,
    ) as DurableDraft;
    // A's own content must still say A, not B's.
    expect(aEnvelopeAfterAtoB.displayName).toBe(PROJECT_A_NAME);
    expect(aEnvelopeAfterAtoB.projectKey).toBe(PROJECT_A_ID);

    // ---- leg 2: B -> A, via "My keyboards"' Resume on A ----
    await act(async () => {
      window.location.hash = "#profile";
    });
    await screen.findAllByTestId("my-keyboards-card");
    const resumeA = await screen.findByRole("button", {
      name: new RegExp(`Resume ${PROJECT_A_NAME}`, "i"),
    });
    fireEvent.click(resumeA);
    await screen.findByTestId("stage-identity");

    const afterBtoA = listDrafts();
    expect(afterBtoA.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );
    expect(afterBtoA).toHaveLength(2);
    expect(localStorage.getItem(draftKey(PROJECT_A_ID))).not.toBeNull();
    expect(localStorage.getItem(draftKey(PROJECT_B_ID))).not.toBeNull();

    const bEnvelopeFinal = JSON.parse(
      localStorage.getItem(draftKey(PROJECT_B_ID))!,
    ) as DurableDraft;
    // B's own content must still say B, not A's — B was not destroyed or
    // clobbered by switching back to A either.
    expect(bEnvelopeFinal.displayName).toBe(PROJECT_B_NAME);
    expect(bEnvelopeFinal.projectKey).toBe(PROJECT_B_ID);

    const aEnvelopeFinal = JSON.parse(
      localStorage.getItem(draftKey(PROJECT_A_ID))!,
    ) as DurableDraft;
    expect(aEnvelopeFinal.displayName).toBe(PROJECT_A_NAME);

    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]") as Array<{
      projectKey: string;
    }>;
    expect(rawIndex.map((e) => e.projectKey).sort()).toEqual(
      [PROJECT_A_ID, PROJECT_B_ID].sort(),
    );
  });
});
