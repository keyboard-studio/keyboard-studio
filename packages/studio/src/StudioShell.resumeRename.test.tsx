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

// SECOND SCENARIO (the second describe below): the reload path the Resume
// click does NOT cover. A project whose stored
// `identity.keyboardId !== baseKeyboard.id` (a completed mid-session rename), restored via the BOOT path — `main.tsx`'s
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
// covered "for free" by the same mechanism the Resume-click path uses; that
// test is what actually pins that claim down. It shares this file's mocks and
// seed, with ONE deliberate deviation: instead of clicking "Resume" from
// #profile, it calls `loadDraft()` directly (exactly what `main.tsx`'s
// `mountApp()` does before `createRoot(...).render(...)`) and mounts
// StudioShell directly on `#survey` (a bare reload lands wherever the
// browser's own persisted hash already was; no navigateTo call is involved on
// that path at all).

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
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
// Guest posture for "My keyboards": signed out, empty cloud list — same
// idiom as MyKeyboardsList.test.tsx. `lib/navigate.ts` is DELIBERATELY left
// unmocked (see module docstring above) — this test needs the real
// window.location.hash-setting behavior.
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
  listDrafts,
  loadDraft,
  resolveActiveProjectKey,
  DRAFT_INDEX_KEY,
} from "./lib/draftPersistence.ts";

const BASE_ID = "basic_kbdus";
const CUSTOM_ID = "my_renamed_keyboard";
const RELOAD_BASE_ID = "basic_kbdus_reload";
const RELOAD_CUSTOM_ID = "my_renamed_keyboard_reload";

beforeEach(() => {
  localStorage.clear();
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
    seedRenamedProjectDraft(BASE_ID, CUSTOM_ID);
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

describe("StudioShell — bare reload of a renamed project does not duplicate the index row (no Resume click)", () => {
  it("main.tsx's pre-mount loadDraft() + a direct #survey mount leaves exactly one 'My keyboards' entry", async () => {
    seedRenamedProjectDraft(RELOAD_BASE_ID, RELOAD_CUSTOM_ID);
    markVisited();

    expect(listDrafts()).toHaveLength(1);
    expect(listDrafts()[0]?.projectKey).toBe(RELOAD_BASE_ID);

    // ---- The exact boot sequence main.tsx's mountApp() runs BEFORE React
    // ever mounts, per that file:
    //   const activeProjectKey = resolveActiveProjectKey();
    //   if (activeProjectKey !== null) loadDraft(activeProjectKey);
    // No resumeProject() call anywhere on this path — loadDraft() alone,
    // which (unlike resumeProject) never touches the active-project pointer
    // on success.
    const activeProjectKey = resolveActiveProjectKey();
    expect(activeProjectKey).toBe(RELOAD_BASE_ID);
    const applied = loadDraft(activeProjectKey!);
    expect(applied).toBe(true);

    // The pointer is UNCHANGED by loadDraft — still the stale, pre-rename
    // key — exactly the condition that makes installDraftAutosave's own
    // key-change migration the only thing standing between this path and a
    // duplicate row.
    expect(resolveActiveProjectKey()).toBe(RELOAD_BASE_ID);

    // A bare reload lands wherever the browser's own hash already was — no
    // navigateTo call, no Resume click, no #profile round trip.
    window.location.hash = "#survey";
    await act(async () => {
      render(<StudioShell />);
    });

    await screen.findByTestId("stage-identity");

    const entries = listDrafts();
    // EXPECTED (the fix's "covered for free" claim): still exactly one row,
    // now keyed on the post-rename id, with the stale RELOAD_BASE_ID record gone —
    // via installDraftAutosave's own migration, triggered purely by
    // SurveyView's mount effect deriving RELOAD_CUSTOM_ID from the loadDraft()-
    // restored working copy, with no click anywhere in this test.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.projectKey).toBe(RELOAD_CUSTOM_ID);
    expect(localStorage.getItem(draftKey(RELOAD_BASE_ID))).toBeNull();

    const rawIndex = JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]") as Array<{
      projectKey: string;
    }>;
    expect(rawIndex.map((e) => e.projectKey).sort()).toEqual([RELOAD_CUSTOM_ID]);
  });
});
