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
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "./stores/phaseBDraftStore.ts";
import { markVisited } from "./lib/firstVisit.ts";
import { seedRenamedProjectDraft } from "./test/draftSeeds.ts";

// ---------------------------------------------------------------------------
// Shared StudioShell harness (test/studioShellMocks/, one module per mocked
// child): shallow child stubs and heavy-hook stubs, so SurveyView can mount
// past "identity" without touching WASM/VFS/network.
// ---------------------------------------------------------------------------

vi.mock("./survey/FlowStepHost.tsx", () => import("./test/studioShellMocks/FlowStepHost.tsx"));
vi.mock("./survey/index.ts", () => import("./test/studioShellMocks/surveyIndex.tsx"));
vi.mock("./editors/panels/BaseResolution.tsx", () => import("./test/studioShellMocks/BaseResolution.tsx"));
vi.mock("./editors/assignLoop/MechanismGallery.tsx", () => import("./test/studioShellMocks/MechanismGallery.tsx"));
vi.mock("./editors/assignLoop/TouchGallery.tsx", () => import("./test/studioShellMocks/TouchGallery.tsx"));
vi.mock("./editors/touchSeedSource/TouchSeedSourcePanel.tsx", () =>
  import("./test/studioShellMocks/TouchSeedSourcePanel.tsx"),
);
vi.mock("./components/UnsupportedScriptStub.tsx", () => import("./test/studioShellMocks/UnsupportedScriptStub.tsx"));
vi.mock("./components/OSKFrame.tsx", () => import("./test/studioShellMocks/OSKFrame.tsx"));
vi.mock("./components/OskModeToggle.tsx", () => import("./test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("./components/CompareScreen.tsx", () => import("./test/studioShellMocks/CompareScreen.tsx"));
vi.mock("./components/OutputScreen.tsx", () => import("./test/studioShellMocks/OutputScreen.tsx"));
vi.mock("./components/WelcomeScreen.tsx", () => import("./test/studioShellMocks/WelcomeScreen.tsx"));
vi.mock("./dashboard/DashboardView.tsx", () => import("./test/studioShellMocks/DashboardView.tsx"));
vi.mock("./hooks/useKeyboardArtifact.ts", () => import("./test/studioShellMocks/useKeyboardArtifact.ts"));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => import("./test/studioShellMocks/useWorkingCopyTransform.ts"));
vi.mock("./lib/confirmRebase.ts", () => import("./test/studioShellMocks/confirmRebase.ts"));
vi.mock("./lib/buildTouchLayoutJson.ts", () => import("./test/studioShellMocks/buildTouchLayoutJson.ts"));

// ---------------------------------------------------------------------------
// Guest posture, `lib/navigate.ts` left unmocked (belt-and-suspenders — this
// test never calls navigateTo at all, but StudioShell's own internals may).
// ---------------------------------------------------------------------------

vi.mock("./hooks/useGitHubAuth.ts", () => import("./test/studioShellMocks/useGitHubAuth.ts"));

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
  loadDraft,
  resolveActiveProjectKey,
  listDrafts,
  DRAFT_INDEX_KEY,
} from "./lib/draftPersistence.ts";


const BASE_ID = "basic_kbdus_reload";
const CUSTOM_ID = "my_renamed_keyboard_reload";


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
    seedRenamedProjectDraft(BASE_ID, CUSTOM_ID);
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
