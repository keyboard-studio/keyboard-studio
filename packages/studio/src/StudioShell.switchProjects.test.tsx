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

// SECOND SCENARIO (the in-place describe below): regression test for a
// confirmed, self-disclosed P0: silent data loss after an IN-PLACE keyboard
// switch via the top-bar `CurrentKeyboardIndicator`.
//
// THE BUG AS CONFIRMED (this test reproduces it; it does not re-investigate
// it). At the time this test was written, `StudioShell.tsx` / `switchActive
// Project.ts` had NOT yet been fixed, and running it against that state
// produced two RED failures — verbatim (line numbers are from the former
// StudioShell.inPlaceSwitch.test.tsx, since merged into this file):
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
// force exactly the missing remount signal, and these tests are GREEN. Do not
// weaken these assertions to "match" a reintroduced bug — they assert the
// CORRECT behaviour (the newly-switched-to project keeps a live autosave)
// and exist so a regression here fails loudly again.
//
// UI-DRIVING CHOICE: the in-place tests drive the REAL `CurrentKeyboardIndicator`
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
// StudioShell.resumeRename.test.tsx / the first describe in this file —
// except here the point is the OPPOSITE of those two: we need the
// REAL "assigning the same hash value fires no hashchange" behaviour, not a
// spy that would hide it. Mocking navigate.ts here would destroy the exact
// condition under test.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "./stores/phaseBDraftStore.ts";
import { markVisited } from "./lib/firstVisit.ts";
import { instantiateAndSave } from "./test/draftSeeds.ts";

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
// Guest posture for "My keyboards": signed out, empty cloud list — same idiom
// as MyKeyboardsList.test.tsx / StudioShell.resumeRename.test.tsx.
// `lib/navigate.ts` is DELIBERATELY left unmocked so a real hashchange fires
// on every Resume click and SurveyView genuinely (re)mounts each time — the
// crux of what this test needs to exercise `installDraftAutosave`'s
// key-change migration for real, twice, in both directions. The in-place
// describe needs the OPPOSITE real behaviour: assigning the hash its current
// value fires no hashchange (see the file header).
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
  resumeProject,
  listDrafts,
  AUTOSAVE_DEBOUNCE_MS,
  DRAFT_INDEX_KEY,
  type DurableDraft,
} from "./lib/draftPersistence.ts";

const PROJECT_A_ID = "kbd_switch_alpha";
const PROJECT_A_NAME = "Alpha Keyboard";
const PROJECT_B_ID = "kbd_switch_beta";
const PROJECT_B_NAME = "Beta Keyboard";
const INPLACE_A_ID = "kbd_inplace_alpha";
const INPLACE_A_NAME = "Alpha In-Place Keyboard";
const INPLACE_B_ID = "kbd_inplace_beta";
const INPLACE_B_NAME = "Beta In-Place Keyboard";

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

/**
 * Drives the REAL top-bar `CurrentKeyboardIndicator` dropdown, exactly as an
 * author would: open the trigger, click the target project's option row.
 * The trigger's accessible name is fixed ("Keyboard", from
 * `aria-labelledby` -> `LABEL_ID`'s "Keyboard" label, per ARIA's
 * `aria-labelledby`-overrides-content-name rule) regardless of which
 * project is currently active, so this query is stable across the switch
 * the in-place tests perform (A->B and, in the mirror test, B->A).
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
    instantiateAndSave(INPLACE_A_ID, INPLACE_A_NAME);
    instantiateAndSave(INPLACE_B_ID, INPLACE_B_NAME);

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
      [INPLACE_A_ID, INPLACE_B_ID].sort(),
    );

    // A was the project the author was last working on — resume it (loads it
    // into the stores AND re-pins draftPersistence's own active pointer),
    // exactly as a prior session ending on A would leave things.
    expect(resumeProject(INPLACE_A_ID)).toBe(true);
    markVisited();

    // THE CRUX SETUP: mount directly on `#survey` (never routing through
    // `#profile`), so `SurveyView` mounts ONCE, for the whole test, and never
    // again. This is what makes the in-place-switch condition reproducible —
    // routing the résumé through `#profile` (as the first describe in this
    // file does) would make `SurveyView`
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
    const aRawAfterMount = localStorage.getItem(draftKey(INPLACE_A_ID));
    expect(aRawAfterMount).not.toBeNull();

    // Fake timers from here on — the debounced autosave write is what this
    // test needs to control precisely. Every remaining interaction below is
    // a synchronous fireEvent/act, so nothing depends on real timers or
    // findBy*/waitFor.
    vi.useFakeTimers();

    // ---- Switch A -> B via the REAL top-bar dropdown, while already on
    // #survey with SurveyView mounted ----
    switchViaTopBarDropdown(INPLACE_B_NAME);

    // Confirm the crux actually held: still on #survey (no navigation
    // occurred because the hash never changed), and the working copy really
    // did switch to B.
    expect(window.location.hash).toBe("#survey");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(INPLACE_B_ID);

    // ---- A real edit to B's (now live) working copy ----
    const EDITED_B_LABEL = `${INPLACE_B_NAME} EDITED`;
    act(() => {
      useWorkingCopyStore.getState().setIdentity({
        keyboardId: INPLACE_B_ID,
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
    const bRawAfterEdit = localStorage.getItem(draftKey(INPLACE_B_ID));
    expect(bRawAfterEdit).not.toBeNull();
    const bEnvelope = JSON.parse(bRawAfterEdit!) as DurableDraft;
    expect(bEnvelope.displayName).toBe(EDITED_B_LABEL);

    // ---- GUARD (must stay GREEN — regression alarm if not): A's own
    // on-disk record must be byte-identical to what it was right after
    // mount. This is the cycle-5 orphan-subscription-becomes-inert fix
    // (draftPersistence.ts scheduleSave's `resolveActiveProjectKey() ===
    // projectKey` guard) — the OLD subscription (still closed over A) must
    // NOT have written B's live content under A's key. ----
    expect(localStorage.getItem(draftKey(INPLACE_A_ID))).toBe(aRawAfterMount);

    // ---- Neither project vanished from "My keyboards" ----
    vi.useRealTimers();
    const finalEntries = listDrafts();
    expect(finalEntries).toHaveLength(2);
    expect(finalEntries.map((e) => e.projectKey).sort()).toEqual(
      [INPLACE_A_ID, INPLACE_B_ID].sort(),
    );
  });

  // Mirror case (symmetry matters — the abandoned-pointer mechanism that
  // produced the ORIGINAL duplicate-row defect this codebase already fixed
  // was itself direction-sensitive; a fix for A->B that silently regresses
  // B->A would be exactly that class of bug again).
  it("B -> A in place: A gains live autosave, B's own record is left untouched, neither project vanishes from the index", async () => {
    instantiateAndSave(INPLACE_A_ID, INPLACE_A_NAME);
    instantiateAndSave(INPLACE_B_ID, INPLACE_B_NAME);

    const seededIndexRaw = JSON.parse(
      localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]",
    ) as Array<{ projectKey: string }>;
    expect(seededIndexRaw.map((e) => e.projectKey).sort()).toEqual(
      [INPLACE_A_ID, INPLACE_B_ID].sort(),
    );

    // This time B is the project the author was last working on.
    expect(resumeProject(INPLACE_B_ID)).toBe(true);
    markVisited();
    window.location.hash = "#survey";

    await act(async () => {
      render(<StudioShell />);
    });
    await screen.findByTestId("stage-identity");

    const bRawAfterMount = localStorage.getItem(draftKey(INPLACE_B_ID));
    expect(bRawAfterMount).not.toBeNull();

    vi.useFakeTimers();

    switchViaTopBarDropdown(INPLACE_A_NAME);

    expect(window.location.hash).toBe("#survey");
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(INPLACE_A_ID);

    const EDITED_A_LABEL = `${INPLACE_A_NAME} EDITED`;
    act(() => {
      useWorkingCopyStore.getState().setIdentity({
        keyboardId: INPLACE_A_ID,
        displayName: EDITED_A_LABEL,
      });
    });

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });

    // FAILING ASSERTION (mirror): A's persisted record must contain the edit.
    const aRawAfterEdit = localStorage.getItem(draftKey(INPLACE_A_ID));
    expect(aRawAfterEdit).not.toBeNull();
    const aEnvelope = JSON.parse(aRawAfterEdit!) as DurableDraft;
    expect(aEnvelope.displayName).toBe(EDITED_A_LABEL);

    // GUARD (must stay GREEN): B's own on-disk record is untouched.
    expect(localStorage.getItem(draftKey(INPLACE_B_ID))).toBe(bRawAfterMount);

    vi.useRealTimers();
    const finalEntries = listDrafts();
    expect(finalEntries).toHaveLength(2);
    expect(finalEntries.map((e) => e.projectKey).sort()).toEqual(
      [INPLACE_A_ID, INPLACE_B_ID].sort(),
    );
  });
});
