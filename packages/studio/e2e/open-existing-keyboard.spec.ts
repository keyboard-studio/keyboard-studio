/**
 * E2E: Open an existing keyboard (spec 111 quickstart section 5, steps 1-2, 5).
 *
 * Flow under test:
 *   welcome -> "Continue as guest" -> start screen (New leads, Open follows)
 *     -> "Open an existing keyboard" -> search -> choose -> "Open this keyboard"
 *     -> criteria view, every finding marked as already failing (pre-existing)
 *
 * Checks:
 *   SC-009  the criteria view is reached within 3 interactions
 *   SC-008  opening changes nothing: no finding is classed "new" until the
 *           author edits something
 *
 * A first-time visitor sees the welcome screen, so this spec does not seed a
 * returning visitor. Playwright is imported from "playwright/test" like the
 * other specs.
 */

import { test, expect } from "playwright/test";

// A small codec-clean catalog keyboard present in every catalog, including the
// partial local keyboards checkout the dev server enumerates.
const OPEN_ID = "basic_kbdfr";

/** Interactions the author performs from the start screen to the criteria view. */
const MAX_INTERACTIONS = 3;

test.describe("Open an existing keyboard (spec 111)", () => {
  test("opens to the criteria view within 3 interactions, all findings pre-existing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Continue as guest" }).click();

    // toBeInViewport, not toBeVisible: a card clipped below an overflow:hidden
    // pane still counts as "visible" to Playwright, which is how the entry once
    // shipped unreachable under the welcome screen.
    const create = page.getByTestId("start-new");
    await expect(create).toBeInViewport({ timeout: 30_000 });
    const entry = page.getByRole("region", { name: /open an existing keyboard/i });
    await expect(entry).toBeInViewport();

    let interactions = 0;

    // Interaction 1: search by id in the entry's picker.
    const search = entry.getByRole("combobox");
    await search.fill(OPEN_ID);
    interactions += 1;

    // Interaction 2: choose the keyboard from the results.
    await entry.locator(`[id$="-opt-${OPEN_ID}"]`).first().click({ timeout: 15_000 });
    interactions += 1;

    // Interaction 3: open it. The button stays disabled while both
    // repositories are being checked.
    const open = entry.getByRole("button", { name: /open this keyboard/i });
    await expect(open).toBeEnabled({ timeout: 30_000 });
    await open.click();
    interactions += 1;

    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/#criteria/);

    // SC-009
    expect(interactions).toBeLessThanOrEqual(MAX_INTERACTIONS);

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
    await page.goto("/");
    await page.getByRole("button", { name: "Continue as guest" }).click();
    const entry = page.getByRole("region", { name: /open an existing keyboard/i });
    await expect(entry).toBeInViewport({ timeout: 30_000 });
    await entry.getByRole("combobox").fill(OPEN_ID);
    await entry.locator(`[id$="-opt-${OPEN_ID}"]`).first().click({ timeout: 15_000 });
    const open = entry.getByRole("button", { name: /open this keyboard/i });
    await expect(open).toBeEnabled({ timeout: 30_000 });
    await open.click();

    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });
    const marks = page.locator('[data-testid^="criteria-open-mark-"]');
    await expect(marks.first()).toBeVisible({ timeout: 60_000 });
    const before = await marks.count();

    // Let the debounce cycle run several times with no author input.
    await page.waitForTimeout(2_000);

    expect(await marks.count()).toBe(before);
    await expect(page.locator('[data-testid^="criteria-open-mark-"][data-finding-class="new"]')).toHaveCount(0);
  });
});
