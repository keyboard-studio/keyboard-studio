/**
 * E2E (GATING — spec 057 FR-080, US2): the Compare tab must have no reachable
 * write path into the author's project.
 *
 * This spec is written to FAIL against the pre-fix tree. Today the tab behind
 * `#preview` runs `usePreviewArtifact`, which passes an `onInstantiate`
 * callback into the compile pipeline; when the author picks a *different*
 * keyboard there, the settle fires `instantiateFromBaseIfConfirmed`
 * (`usePreviewArtifact.ts:172-176` -> `confirmRebase.ts:126-142`), which asks
 * `window.confirm` and — on accept — rebases the working copy, resetting
 * `phaseResults` and `irAxes`. The same screen also mounts a live
 * `TrackOneIdentityPanel`, a direct editing control over the author's project.
 *
 * FR-025 asks for isolation established structurally, so both halves are
 * pinned:
 *
 *   (a) IDENTITY-CONTROL ABSENCE — the deterministic anchor. The panel is
 *       mounted today (`TrackOneIdentityPanel.tsx`, rendered by
 *       `PreviewScreen`'s `identityPanelSlot`) and is removed with the screen
 *       itself, so this goes red for an unambiguously right reason,
 *       independent of any dialog timing.
 *   (b) NO WRITE PATH — a dialog harness that COUNTS every `window.confirm`
 *       regardless of the answer, run in two branches. The dismiss branch
 *       alone would be a non-signal (it passes both before and after the fix,
 *       since a cancelled rebase writes nothing), so the accept branch is the
 *       one that carries FR-025's adversarial requirement: pre-fix it accepts
 *       a real rebase and the working copy's baseId/phaseResults change.
 *
 * Selector note: the reference specs `switch-base-exploration.spec.ts` /
 * `switch-base-rebase.spec.ts` drive `editors/panels/BaseResolution.tsx`,
 * which has `base-card-*` / `base-confirm` test ids. THIS tab's picker is
 * `components/BaseKeyboardPicker.tsx` — a plain combobox with zero
 * `data-testid` and no confirm button, where clicking an option calls
 * `commit()` and fires `onChange` immediately. Only the option-selection
 * idiom (`[id$="-opt-${id}"]`) is reused; porting the confirm-button idiom
 * would die on selector-not-found, which is a worthless red.
 *
 * Not `.skip`-ped, ever (FR-083).
 */

import { test, expect, type Page, type Dialog } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";

const OWN_BASE = "basic_kbdfr";
const FOREIGN_BASE = "bj_cree_woods";

// TS mirror of the flag-gated window hook (src/lib/e2eHook.ts), matching
// switch-base-rebase.spec.ts's declaration.
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

interface ProjectState {
  baseId: string | null;
  phaseResultsCount: number;
  deletedNodeIds: string[];
}

async function readProjectState(page: Page): Promise<ProjectState> {
  return page.evaluate(() => ({
    baseId: window.__ksE2E__?.getBaseKeyboardId() ?? null,
    phaseResultsCount: window.__ksE2E__?.getPhaseResultsCount() ?? -1,
    deletedNodeIds: window.__ksE2E__?.getDeletedNodeIds() ?? [],
  }));
}

/**
 * Records every dialog the page raises and answers it with `action`. Counting
 * is unconditional: a dialog that is dismissed is still a dialog, and FR-022
 * forbids one being offered at all.
 */
interface DialogHarness {
  count: () => number;
  lastMessage: () => string | null;
}

function attachDialogHarness(page: Page, action: "accept" | "dismiss"): DialogHarness {
  let count = 0;
  let lastMessage: string | null = null;
  page.on("dialog", async (d: Dialog) => {
    count += 1;
    lastMessage = d.message();
    if (action === "accept") await d.accept();
    else await d.dismiss();
  });
  return { count: () => count, lastMessage: () => lastMessage };
}

/**
 * Walk far enough to own a real working copy: identity-lite answers (which
 * record a phase result) plus a confirmed base (which instantiates). That is
 * the project the Compare tab must not be able to touch.
 */
async function establishWorkingCopy(page: Page): Promise<void> {
  await driveIdentityLite(page, {
    english: "Test",
    autonym: "Test Autonym",
    script: "other",
  });
  await pickBaseKeyboard(page, OWN_BASE);
  await expect
    .poll(async () => (await readProjectState(page)).baseId, { timeout: 60_000 })
    .toBe(OWN_BASE);
}

/**
 * Load a DIFFERENT keyboard on the Compare tab through its own combobox.
 * Selecting an option commits immediately — there is no confirm button here.
 */
async function loadForeignKeyboardOnCompare(page: Page): Promise<void> {
  const combobox = page.getByRole("combobox").first();
  await combobox.waitFor({ timeout: 60_000 });
  await combobox.click();
  await combobox.fill(FOREIGN_BASE);
  await page.locator(`[id$="-opt-${FOREIGN_BASE}"]`).first().click({ timeout: 30_000 });
}

test.describe("Compare cannot write to the author's project (spec 057 US2)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    // ?e2e=1 arms window.__ksE2E__ (src/lib/e2eHook.ts).
    await page.goto("/?e2e=1");
  });

  test("the tab exposes no identity-editing control over the project", async ({ page }) => {
    await establishWorkingCopy(page);
    await switchTab(page, "preview");

    // Wait for the tab's own pane to be up before asserting an ABSENCE.
    // `toHaveCount(0)` is satisfied instantly by a screen that has not
    // rendered yet, so without this the assertion is a false pass both
    // before and after the fix. The picker combobox exists on this tab in
    // both the pre-fix (PreviewScreen) and post-fix (CompareScreen) shapes,
    // which is what makes it usable as the settle signal across the
    // red/green boundary.
    await expect(page.getByRole("combobox").first()).toBeVisible({ timeout: 60_000 });

    // (a) The deterministic anchor. TrackOneIdentityPanel renders a
    // <section aria-label="Name your keyboard"> whenever the working copy is
    // Track 1 ("new-from-base"), which it is after a plain base confirm.
    // Pre-fix this control is live on the tab; FR-023 requires its absence.
    await expect(
      page.getByRole("region", { name: /Name your keyboard/i }),
      "an identity-editing control is reachable on the Compare tab",
    ).toHaveCount(0);
  });

  test("loading another keyboard raises no dialog and leaves the project untouched (dismiss)", async ({
    page,
  }) => {
    const dialogs = attachDialogHarness(page, "dismiss");
    await establishWorkingCopy(page);
    const before = await readProjectState(page);

    await switchTab(page, "preview");
    await loadForeignKeyboardOnCompare(page);

    // Give the decoupled compile pipeline time to settle and fire whatever
    // it is going to fire — the write path is async, not on the click.
    await page.waitForTimeout(8_000);

    expect(dialogs.count(), `a confirm dialog was offered: ${dialogs.lastMessage() ?? ""}`).toBe(0);

    await switchTab(page, "survey");
    expect(await readProjectState(page)).toEqual(before);
  });

  test("loading another keyboard and ACCEPTING anything offered still leaves the project untouched", async ({
    page,
  }) => {
    // The adversarial branch (FR-025): answer "yes" to every dialog. Pre-fix
    // this accepts the rebase, so baseId flips to the foreign keyboard and
    // phaseResults is cleared. Post-fix there is nothing to accept, because
    // `useCompareArtifact` passes no `onInstantiate` at all.
    const dialogs = attachDialogHarness(page, "accept");
    await establishWorkingCopy(page);
    const before = await readProjectState(page);
    expect(before.baseId).toBe(OWN_BASE);

    await switchTab(page, "preview");
    await loadForeignKeyboardOnCompare(page);
    await page.waitForTimeout(8_000);

    expect(dialogs.count(), `a confirm dialog was offered: ${dialogs.lastMessage() ?? ""}`).toBe(0);

    const after = await readProjectState(page);
    expect(after.baseId, "the Compare tab rebased the author's working copy").toBe(OWN_BASE);
    expect(
      after.phaseResultsCount,
      "the Compare tab discarded recorded survey answers",
    ).toBe(before.phaseResultsCount);
    expect(after.deletedNodeIds).toEqual(before.deletedNodeIds);
  });
});
