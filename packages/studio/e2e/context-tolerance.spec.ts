/**
 * E2E: context tolerance reaches the author (spec 078).
 *
 * The feature is behind VITE_KM_CONTEXT_TOLERANCE until the corpus gate is
 * green (FR-011), so this spec runs only when the dev server was started with
 * the flag. Run it with:
 *
 *   VITE_KM_CONTEXT_TOLERANCE=1 npx playwright test e2e/context-tolerance.spec.ts
 *
 * (Playwright's webServer inherits the environment; with reuseExistingServer a
 * server already running WITHOUT the flag will show no finding — stop it first.)
 *
 * US1: adapting sil_yoruba8 surfaces the finding after the preview is ready,
 * the finding expands to cases naming each character by codepoint and Unicode
 * name, and nothing about it blocks the download. A keyboard with no gap
 * (basic_kbdfr) shows no finding.
 *
 * US2/US3: the marks series proposes the fix, pre-filled. Accepting applies it:
 * the notice then reports the rules fixed, which the analysis only says once
 * the replayed rules are present in the keyboard the preview compiled (the same
 * projectWorkingCopyVfs output the download zips). A partial accept leaves the
 * unticked rule reported; declining changes nothing. The Output tab is gated
 * behind the rest of the walk, so the .kmn replay is pinned by
 * projectWorkingCopyVfs.contextTolerance.test.ts, and the simulator-level
 * checks (SC-003, composed byte-identity) by the engine's
 * context-tolerance-overlay.test.ts against the same overlay.
 */

import { test, expect, type Page } from "playwright/test";
import {
  chooseAdaptTrack,
  confirmPrefill,
  driveIdentityLite,
  pickBaseKeyboard,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const FLAG_ON = process.env["VITE_KM_CONTEXT_TOLERANCE"] === "1";

async function adapt(page: Page, keyboardId: string): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page);
  await pickBaseKeyboard(page, keyboardId);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
}

test.describe("Context tolerance — US1 diagnosis (spec 078)", () => {
  test.skip(!FLAG_ON, "needs a dev server started with VITE_KM_CONTEXT_TOLERANCE=1");

  test("sil_yoruba8: the finding appears after the preview, names characters, and blocks nothing", async ({ page }) => {
    await adapt(page, "sil_yoruba8");

    // The analysis runs after the preview compile reaches ready (FR-001), in
    // the survey pane's existing live region (FR-014).
    const notice = page.getByTestId("context-tolerance-notice");
    await expect(notice).toBeVisible({ timeout: 120_000 });
    await expect(notice.locator("xpath=ancestor::*[@role='status'][@aria-live='polite']")).toHaveCount(1);
    await expect(notice).toContainText(/only works? when the accent is already joined to the letter/);

    await notice.getByRole("button", { name: /show the affected rules/i }).click();
    await expect(notice).toContainText("U+0323 COMBINING DOT BELOW", { timeout: 30_000 });
    await expect(notice).toContainText(/U\+[0-9A-F]{4} LATIN SMALL LETTER [A-Z]\b/);
    // The typed text is shown too, so the case is reproducible (FR-003).
    await expect(notice).toContainText(/After this text, with the accent joined to the letter/);

    // Advisory only (FR-002): the download stays available with the finding up.
    await page.click('a[href="#output"]');
    await page.waitForSelector('[data-testid="output-screen-root"]', { timeout: 30_000 });
    await expect(page.getByTestId("emit-download")).toBeEnabled({ timeout: 60_000 });
  });

  test("basic_kbdfr: a keyboard with no gap shows no finding", async ({ page }) => {
    await adapt(page, "basic_kbdfr");

    // Wait for the analysis to settle (it publishes nothing visible for a
    // clean keyboard), then assert the finding never appeared.
    await page.waitForFunction(() => document.querySelector('[data-testid="osk-frame"], iframe') !== null, null, {
      timeout: 120_000,
    });
    await page.waitForTimeout(15_000);
    await expect(page.getByTestId("context-tolerance-notice")).toHaveCount(0);
  });
});

/** Phase B with one marked letter, then walk the marks series up to the station. */
async function reachStation(page: Page): Promise<void> {
  await adapt(page, "sil_yoruba8");
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
  await page.click('[data-testid="phase-b-intro-next"]');
  await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
  await page.fill('[aria-label="Character to add"]', "ẹ");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 5_000 });
  await page.click('[data-testid="phase-b-done"]');

  const station = page.getByTestId("context-tolerance-station");
  for (let i = 0; i < 8; i++) {
    if (await station.isVisible().catch(() => false)) return;
    const checking = page.getByTestId("context-tolerance-checking");
    if (await checking.isVisible().catch(() => false)) {
      // The analysis is still running; the proposal replaces this in place.
      await expect(station).toBeVisible({ timeout: 120_000 });
      return;
    }
    await page.getByTestId("marks-continue").click({ timeout: 20_000 });
  }
  await expect(station).toBeVisible({ timeout: 120_000 });
}

test.describe("Context tolerance — US2 accept and US3 decline (spec 078)", () => {
  test.skip(!FLAG_ON, "needs a dev server started with VITE_KM_CONTEXT_TOLERANCE=1");
  // Three compiles follow the decision (verify, recompile, re-analysis) on top
  // of the walk itself.
  test.setTimeout(480_000);

  test("accepting applies the fix to the compiled keyboard and the notice reports it", async ({ page }) => {
    await reachStation(page);
    const ticks = page.getByTestId("context-tolerance-station").getByRole("checkbox");
    expect(await ticks.count()).toBeGreaterThan(0);
    for (const tick of await ticks.all()) await expect(tick).toBeChecked();

    // SC-002: accept is one interaction from the decision point.
    await page.getByRole("button", { name: "Add these rules" }).click();

    // The notice lives in the survey pane, which the next Phase B screens show
    // (full-screen steps such as the carve gallery hide it, like every global
    // warning), so the outcome is asserted here: the apply effect commits the
    // fix, the preview recompiles, and the re-analysis reports the rules fixed.
    await expect(page.getByTestId("context-tolerance-made-tolerant")).toBeVisible({ timeout: 180_000 });
    // Every proposed rule was accepted, so no gap is left.
    await expect(page.getByTestId("context-tolerance-notice")).not.toContainText(/only works? when the accent/);
  });

  test("a partial accept applies only the ticked rules", async ({ page }) => {
    await reachStation(page);
    const ticks = await page.getByTestId("context-tolerance-station").getByRole("checkbox").all();
    test.skip(ticks.length < 2, "needs at least two fixable rules to untick one");
    await ticks[ticks.length - 1]!.uncheck();
    await page.getByRole("button", { name: "Add these rules" }).click();

    await expect(page.getByTestId("context-tolerance-made-tolerant")).toBeVisible({ timeout: 180_000 });
    const notice = page.getByTestId("context-tolerance-notice");
    // The unticked rule is still reported as a gap.
    await expect(notice).toContainText(/1 rule only works when the accent is already joined to the letter/);
  });

  test("declining leaves the keyboard without the fix and keeps the finding", async ({ page }) => {
    await reachStation(page);
    await page.getByRole("button", { name: "Leave my keyboard as it is" }).click();

    // The finding stays visible as advisory (FR-009).
    await expect(page.getByTestId("context-tolerance-notice")).toContainText(
      /only works? when the accent is already joined to the letter/,
      { timeout: 60_000 },
    );
    // Nothing was applied: after a settle period no rule reads as fixed.
    await page.waitForTimeout(20_000);
    await expect(page.getByTestId("context-tolerance-made-tolerant")).toHaveCount(0);

    // Re-raise suppression on a revisit, and re-raising after an affected rule
    // changes (FR-009), are covered by MarksSeriesStep.contextTolerance.test.tsx
    // and ContextToleranceStation.test.tsx: reaching the series again mid-walk
    // has no stable e2e handle.
  });
});
