/**
 * E2E: Open an existing keyboard (spec 111 quickstart section 5, steps 1-2, 5; Phase 12 walk).
 *
 * Flow under test:
 *   welcome -> "Continue as guest" -> start screen (New leads, Open follows)
 *     -> "Open an existing keyboard" -> search -> choose -> "Open this keyboard"
 *     -> the Languages step (the start of the Open walk, FR-031)
 *     -> Continue through the walk -> Review (the criteria view, every finding
 *        marked as already failing) -> Continue to Output
 *
 * Checks:
 *   SC-009  the walk starts within 3 interactions
 *   SC-008  opening changes nothing: no finding is classed "new" until the
 *           author edits something
 *   US8     a Continue-only walk of an upstream basic keyboard reaches Output
 *
 * A first-time visitor sees the welcome screen, so this spec does not seed a
 * returning visitor. Playwright is imported from "playwright/test" like the
 * other specs.
 */

import { test, expect, type Page } from "playwright/test";
import { continueOpenWalk as continueWalk, openExistingKeyboard } from "./helpers/surveyFlow";

// A small codec-clean catalog keyboard present in every catalog, including the
// partial local keyboards checkout the dev server enumerates.
const OPEN_ID = "basic_kbdfr";

// The upstream basic keyboard the Continue-only walk takes (spec 111 Story 8 independent test).
const WALK_ID = "basic_kbdus";

// A small non-basic keyboard: its walk includes Letters and the Mechanisms gallery.
const NON_BASIC_ID = "sudest";

/** Interactions the author performs from the start screen to the first walk step. */
const MAX_INTERACTIONS = 3;

const openKeyboard = (page: Page, keyboardId: string = OPEN_ID) => openExistingKeyboard(page, keyboardId);

test.describe("Open an existing keyboard (spec 111)", () => {
  test("opens on the Languages step within 3 interactions", async ({ page }) => {
    const interactions = await openKeyboard(page);

    await expect(page.getByRole("heading", { name: /languages this keyboard supports/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/#survey/);
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();

    // SC-009
    expect(interactions).toBeLessThanOrEqual(MAX_INTERACTIONS);
  });

  test("Review lists every finding as pre-existing, and none is new", async ({ page }) => {
    await openKeyboard(page);
    await expect(page.getByRole("heading", { name: /languages this keyboard supports/i })).toBeVisible({
      timeout: 60_000,
    });
    // The criteria view stays reachable from the navigation bar at any time.
    // The walk's pipeline instantiates the working copy while Languages is showing;
    // the list fills from the keyboard's own descriptor once it exists.
    await expect(page.locator("#open-languages-heading + section ol li").first()).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => { window.location.hash = "criteria"; });
    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });

    // Every marked finding is pre-existing; none is new (SC-008, SC-009 step 1).
    // Wait for the ratchet marks to settle, then assert on whatever is shown.
    const marks = page.locator('[data-testid^="criteria-open-mark-"]');
    await expect(marks.first()).toBeVisible({ timeout: 60_000 });
    const total = await marks.count();
    expect(total).toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="criteria-open-mark-"][data-finding-class="new"]')).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="criteria-open-mark-"][data-finding-class="pre-existing"]'),
    ).toHaveCount(total);
  });

  test("no change without interaction: waiting on the criteria view adds no new findings", async ({ page }) => {
    await openKeyboard(page);
    await expect(page.getByRole("heading", { name: /languages this keyboard supports/i })).toBeVisible({
      timeout: 60_000,
    });
    // The walk's pipeline instantiates the working copy while Languages is showing;
    // the list fills from the keyboard's own descriptor once it exists.
    await expect(page.locator("#open-languages-heading + section ol li").first()).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => { window.location.hash = "criteria"; });
    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });
    const marks = page.locator('[data-testid^="criteria-open-mark-"]');
    await expect(marks.first()).toBeVisible({ timeout: 60_000 });
    const before = await marks.count();

    // Let the debounce cycle run several times with no author input.
    await page.waitForTimeout(2_000);

    expect(await marks.count()).toBe(before);
    await expect(page.locator('[data-testid^="criteria-open-mark-"][data-finding-class="new"]')).toHaveCount(0);
  });

  /** Walk `keyboardId` with Continue only; returns the controls pressed, in order, ending at Output. */
  async function continueOnlyWalk(page: Page, keyboardId: string): Promise<string[]> {
    await openKeyboard(page, keyboardId);
    await expect(page.getByRole("heading", { name: /languages this keyboard supports/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator("#open-languages-heading + section ol li").first()).toBeVisible({ timeout: 60_000 });

    const pressed: string[] = [];
    for (let step = 0; step < 40 && !/#criteria/.test(page.url()); step += 1) {
      pressed.push(await continueWalk(page));
      await page.waitForTimeout(500);
    }
    // eslint-disable-next-line no-console
    console.log(`[OK] ${keyboardId} walk controls pressed: ${pressed.join(" > ")}`);
    await expect(page).toHaveURL(/#criteria/);
    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("criteria-continue").click();
    // "Continue to Output" still navigates to #output, but the route now
    // redirects into the tail — the finished walk lands on Publish.
    await expect(page.getByTestId("publish-step-root")).toBeVisible({ timeout: 30_000 });
    return pressed;
  }

  test("a Continue-only walk of upstream basic_kbdus reaches Review, then Output (US8)", async ({ page }) => {
    test.setTimeout(300_000);
    const pressed = await continueOnlyWalk(page, WALK_ID);
    // A basic keyboard's physical layout is fixed: its walk never offers the Mechanisms gallery.
    expect(pressed.some((p) => p.includes("mechanisms"))).toBe(false);
    expect(pressed).toContain("osk-continue");
    expect(pressed).toContain("touch-continue");
  });

  test("a non-basic keyboard walks Languages, Letters, Mechanisms, OSK, Touch in that order (US8)", async ({ page }) => {
    test.setTimeout(300_000);
    await openKeyboard(page, NON_BASIC_ID);
    await expect(page.locator("#open-languages-heading + section ol li").first()).toBeVisible({ timeout: 60_000 });

    // Languages -> Letters, which a non-basic keyboard always walks.
    await continueWalk(page);
    await expect(page.getByRole("heading", { name: /^letters$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("open-letters-inventory")).toBeVisible();

    // The Letters page's Continue leads to the Mechanisms gallery, then the OSK, then Touch.
    const pressed: string[] = [await continueWalk(page)];
    for (let step = 0; step < 40 && !/#criteria/.test(page.url()); step += 1) {
      pressed.push(await continueWalk(page));
      await page.waitForTimeout(500);
    }
    // eslint-disable-next-line no-console
    console.log(`[OK] ${NON_BASIC_ID} walk controls pressed after Letters: ${pressed.join(" > ")}`);
    const at = (id: string) => pressed.findIndex((p) => p.includes(id));
    expect(at("mechanisms")).toBeGreaterThan(-1);
    expect(at("fallback-policy-continue")).toBeGreaterThan(at("mechanisms"));
    expect(at("osk-continue")).toBeGreaterThan(at("fallback-policy-continue"));
    expect(at("touch-continue")).toBeGreaterThan(at("osk-continue"));
  });
});
