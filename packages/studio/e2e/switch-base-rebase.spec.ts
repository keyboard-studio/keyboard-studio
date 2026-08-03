// switch-base-rebase.spec.ts — F1 regression suite.
//
// F1 ("in-session base switch silently desyncs UI vs working copy") is fixed
// by making BaseResolutionAdapter.onConfirm run the rebase-confirm question
// SYNCHRONOUSLY (confirmRebaseTo — src/lib/confirmRebase.ts) BEFORE flipping
// baseConfirmed / calling onComplete, and by replacing StudioShell's
// once-per-mount instantiatedRef with an id-aware instantiatedForBaseIdRef so
// a confirm for a genuinely different base actually re-instantiates. See
// docs/design-notes/switch-base-popup-behavior-log.md for the empirical
// behavior this fixes, and the exploratory matrix this suite's fixture/helpers
// are adapted from: e2e/switch-base-exploration.spec.ts.
//
// Fixture (same as the exploration spec): initial base bj_cree_woods, switch
// to basic_kbdfr, free-text identity ("Test" / script "other") routing to the
// in-survey "adapt" track choice (the exploration log's own header labels
// this "Track 1 (adapt)").
//
// Run: cd packages/studio && npx playwright test e2e/switch-base-rebase.spec.ts

import { test, expect, type Page, type Dialog } from "playwright/test";
import { driveIdentityLite, chooseAdaptTrack, seedReturningVisitor } from "./helpers/surveyFlow";

const BASE_A = "bj_cree_woods";
const BASE_B = "basic_kbdfr";

// TS mirror of the flag-gated window hook (src/lib/e2eHook.ts).
declare global {
  interface Window {
    __ksE2E__?: {
      getWorkingIr(): { header?: unknown } | null;
      getDeletedNodeIds(): string[];
      getBaseKeyboardId(): string | null;
      getPhaseResultsCount(): number;
    };
  }
}

// ---------------------------------------------------------------------------
// Dialog harness — records every window.confirm the page fires and answers it
// with whatever `dialogAction` currently holds (mutable across the test via
// the returned setter), mirroring switch-base-exploration.spec.ts's `attach`.
// ---------------------------------------------------------------------------

interface DialogHarness {
  dialogCount: () => number;
  lastMessage: () => string | null;
  setAction: (a: "accept" | "dismiss") => void;
}

function attachDialogHarness(page: Page): DialogHarness {
  let count = 0;
  let lastMessage: string | null = null;
  let action: "accept" | "dismiss" = "dismiss";
  page.on("dialog", async (d: Dialog) => {
    count += 1;
    lastMessage = d.message();
    if (action === "accept") await d.accept();
    else await d.dismiss();
  });
  return {
    dialogCount: () => count,
    lastMessage: () => lastMessage,
    setAction: (a) => {
      action = a;
    },
  };
}

// ---------------------------------------------------------------------------
// Base-picker interactions (preview vs confirm kept separate on purpose,
// mirroring the real BaseResolutionAdapter preview/commit split under test).
// ---------------------------------------------------------------------------

async function previewBase(page: Page, id: string): Promise<void> {
  const card = page.getByTestId(`base-card-${id}`);
  if (await card.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await card.click();
  } else {
    await page.getByTestId("search-scope-all").click();
    const search = page.getByPlaceholder(/Type to search by name/i);
    await search.fill(id);
    await page.locator(`[id$="-opt-${id}"]`).first().click({ timeout: 20_000 });
  }
  await expect(page.getByTestId("base-confirm")).toBeEnabled({ timeout: 120_000 });
}

/** Click "Choose this keyboard". Does NOT wait for any dialog or advance — callers assert those. */
async function clickConfirm(page: Page): Promise<void> {
  await page.getByTestId("base-confirm").click();
}

/**
 * Walk back to the base picker from wherever the wizard currently is. The
 * fixture only ever needs a single hop (choose_base -> track), but this
 * mirrors the exploration spec's multi-hop loop for robustness.
 */
async function backToBasePicker(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (await page.getByTestId("base-picker").isVisible({ timeout: 800 }).catch(() => false)) {
      return;
    }
    const backButton = page.getByTestId("survey-back");
    if (await backButton.isVisible({ timeout: 400 }).catch(() => false)) {
      await backButton.click();
    } else {
      await page.goBack();
    }
    await page.waitForTimeout(500);
  }
  throw new Error("switch-base-rebase.spec: failed to reach base picker within 10 back hops");
}

async function hookState(page: Page): Promise<{ baseId: string | null; phaseResultsCount: number }> {
  return page.evaluate(() => ({
    baseId: window.__ksE2E__?.getBaseKeyboardId() ?? null,
    phaseResultsCount: window.__ksE2E__?.getPhaseResultsCount() ?? -1,
  }));
}

async function draftKeysInStorage(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("ks.draft.") && k !== "ks.draft.active"),
  );
}

/**
 * Build to L3 (base A confirmed; at the track step) via the shared fixture:
 * identity (free-text "Test" / script "other") -> preview+confirm base A.
 * Matches switch-base-exploration.spec.ts's buildToLevel("L3-base-confirmed").
 */
async function buildToBaseAConfirmed(page: Page): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/?e2e=1");
  await driveIdentityLite(page, { english: "Test", autonym: "Test Autonym", script: "other" });
  await previewBase(page, BASE_A);
  await clickConfirm(page);
  await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("F1 — switch-base rebase confirm", () => {
  test("switching to a DIFFERENT base with edits: Cancel keeps the OLD base everywhere, no advance", async ({
    page,
  }) => {
    const dialogs = attachDialogHarness(page);
    await buildToBaseAConfirmed(page);

    // The identity phase result was recorded (and preserved across the first
    // instantiate) BEFORE this point, so the working copy already carries
    // edits by L3 — confirmRebaseIfEdited's hasUnsavedEdits() is already true.
    const beforeState = await hookState(page);
    expect(beforeState.baseId).toBe(BASE_A);
    expect(beforeState.phaseResultsCount).toBeGreaterThan(0);
    const draftsBefore = await draftKeysInStorage(page);
    expect(draftsBefore).toContain(`ks.draft.${BASE_A}.v1`);

    await backToBasePicker(page);
    await previewBase(page, BASE_B);

    dialogs.setAction("dismiss"); // Cancel
    await clickConfirm(page);
    await page.waitForTimeout(1_500);

    expect(dialogs.dialogCount()).toBe(1);
    expect(dialogs.lastMessage()).toMatch(/discard your current edits/i);

    // Nothing changed: still at the base picker (wizard did not advance),
    // working copy still on the OLD base, OLD draft key still present, no NEW
    // draft key was ever written for the base that was merely previewed.
    await expect(page.getByTestId("base-picker")).toBeVisible();
    const afterCancel = await hookState(page);
    expect(afterCancel.baseId).toBe(BASE_A);
    expect(afterCancel.phaseResultsCount).toBe(beforeState.phaseResultsCount);
    const draftsAfterCancel = await draftKeysInStorage(page);
    expect(draftsAfterCancel).toContain(`ks.draft.${BASE_A}.v1`);
    expect(draftsAfterCancel).not.toContain(`ks.draft.${BASE_B}.v1`);

    // Now accept the SAME confirm (still previewing base B) — OK switches
    // cleanly: working copy, draft key, AND the wizard all move to base B.
    dialogs.setAction("accept");
    await clickConfirm(page);
    await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 30_000 });

    expect(dialogs.dialogCount()).toBe(2);
    const afterOk = await hookState(page);
    expect(afterOk.baseId).toBe(BASE_B);
    // A genuine switch resets phaseResults (resolveInstantiationCase's
    // "genuine switch" branch in workingCopyStore.ts) — the identity phase
    // recorded against base A no longer applies to base B's working copy.
    expect(afterOk.phaseResultsCount).toBe(0);
    const draftsAfterOk = await draftKeysInStorage(page);
    expect(draftsAfterOk).toContain(`ks.draft.${BASE_B}.v1`);
    expect(draftsAfterOk).not.toContain(`ks.draft.${BASE_A}.v1`);
  });

  test("re-confirming the SAME base: no popup, phaseResults preserved, wizard advances", async ({ page }) => {
    const dialogs = attachDialogHarness(page);
    await buildToBaseAConfirmed(page);

    const before = await hookState(page);
    expect(before.baseId).toBe(BASE_A);
    expect(before.phaseResultsCount).toBeGreaterThan(0);

    await backToBasePicker(page);
    await previewBase(page, BASE_A); // same base again

    dialogs.setAction("accept"); // should never be consulted
    await clickConfirm(page);
    await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 30_000 });

    expect(dialogs.dialogCount()).toBe(0);
    const after = await hookState(page);
    expect(after.baseId).toBe(BASE_A);
    expect(after.phaseResultsCount).toBe(before.phaseResultsCount);
  });

  // F2 (in-scope only if it fell out of the same seam — see the design note's
  // "Suggested direction"). doCommit now always passes skipRebaseConfirm:
  // true (the confirm question is resolved exclusively, synchronously, in
  // BaseResolutionAdapter.onConfirm) — so the once-per-mount re-commit that
  // fires on a plain reload never asks the question at all, and — because the
  // restored working copy's base id always matches the artifact the
  // re-compiled pipeline settles for — instantiateFromBase's own
  // same-id/same-mode no-op (resolveInstantiationCase) preserves phaseResults
  // regardless. This test asserts both halves of that hold.
  test("F2: refresh at the track step — no popup, phaseResults preserved", async ({ page }) => {
    const dialogs = attachDialogHarness(page);
    await buildToBaseAConfirmed(page);
    await chooseAdaptTrack(page);
    await page.waitForSelector('[data-testid="prefill-confirm"]', { timeout: 30_000 });

    const before = await hookState(page);
    expect(before.baseId).toBe(BASE_A);
    expect(before.phaseResultsCount).toBeGreaterThan(0);

    dialogs.setAction("accept"); // should never be consulted
    await page.reload();
    await page.waitForTimeout(3_000);

    expect(dialogs.dialogCount()).toBe(0);
    const after = await hookState(page);
    expect(after.baseId).toBe(BASE_A);
    expect(after.phaseResultsCount).toBe(before.phaseResultsCount);
  });
});
