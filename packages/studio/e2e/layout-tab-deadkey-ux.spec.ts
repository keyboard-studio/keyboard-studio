// E2E regression: Layout-tab deadkey disclosure + edit-panel reach (2026-11-11 fixes).
//
// Two defects found on the Bafut-from-Cameroon-QWERTY walk, fixed in LayoutPane /
// DeadkeyList / DeadkeyTablePanel / KeyDetailPanel:
//   1. The deadkey list rendered all its rows unprompted on arrival, and an opened
//      deadkey table had no Close button and stayed open after selecting another key.
//   2. The key-edit panel lived inside the detail panel, so at 150% zoom its top sat
//      below the viewport bottom — and scrolling to it pushed the selected cell out
//      of view. It now renders directly under the grid, with a scroll safety net
//      (ensureEditVisible) that fits the panel while keeping the selected cell in view.
//
// The walk reuses the shared surveyFlow helpers (the same Bafut walk the temporary
// measurement probe used). Zoom is simulated the way the probe did it: same physical
// pixels, smaller CSS viewport (1280x720 is 150% of 1920x1080).
//
// Run:
//   cd packages/studio && npx playwright test layout-tab-deadkey-ux.spec.ts --project=desktop

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickStartKeyboard,
  confirmCopyTrack,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

/** Walk identity -> copy Cameroon QWERTY -> carve -> deadkeys -> rules, landing on the Layout tab. */
async function reachLayoutTab(page: Page): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, { english: "Test", autonym: "Bafut", script: "Latn" });
  await pickStartKeyboard(page, "sil_cameroon_qwerty");
  await confirmCopyTrack(page);
  await driveAttributionStep(page);
  await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, "é");
  await page.getByTestId("carve-gallery").waitFor({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await driveDeadkeysStep(page);
  await page.getByTestId("rules-continue").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("rules-continue").click();
  await page.getByTestId("editor-view-tabs").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId("editor-view-tab-layout").click();
  await expect(page.getByTestId("editor-view-panel-layout")).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 60_000 });
}

/** Assert a locator's box sits fully inside the CSS viewport (not pixel-perfect, just jointly visible). */
async function expectInViewport(page: Page, testId: string, label: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x, `${label} left edge is inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${label} top edge is inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label} right edge is inside the viewport`).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height, `${label} bottom edge is inside the viewport`).toBeLessThanOrEqual(vp.height);
}

test.describe("Layout tab deadkey disclosure and table close", () => {
  test.setTimeout(600_000);

  test("deadkey list is collapsed on arrival; opening a table and closing it returns focus to its row", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await reachLayoutTab(page);

    // On arrival: no table open, and the list shows its heading + toggle only.
    // Cameroon QWERTY carries 2 deadkeys, so the toggle names the count.
    await expect(page.getByTestId("deadkey-table-panel")).toHaveCount(0);
    const toggle = page.getByTestId("deadkey-list-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("Show 2 deadkeys");
    await expect(page.getByTestId("deadkey-list-item")).toHaveCount(0);

    // Expand the list the way an author does, then open the first deadkey's table.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText("Hide deadkeys");
    await expect(page.getByTestId("deadkey-list-item")).toHaveCount(2);
    const openButton = page.getByTestId("deadkey-list-open").first();
    await openButton.click();
    await expect(page.getByTestId("deadkey-table-panel")).toBeVisible({ timeout: 30_000 });

    // Close it: the table goes, the list stays expanded, and focus lands back
    // on the row the table was opened from (not lost to the page body).
    await page.getByTestId("deadkey-table-close").click();
    await expect(page.getByTestId("deadkey-table-panel")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(openButton).toBeFocused();
  });
});

test.describe("Layout tab edit panel stays with its key when zoomed", () => {
  test.setTimeout(600_000);

  test("selected key and edit panel are jointly in view at 150% zoom and at 100%", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await reachLayoutTab(page);

    // 150% zoom: same physical pixels, CSS viewport 1280x720. Before the fix the
    // edit panel's top sat below the viewport bottom here, and scrolling to it
    // pushed the selected cell out of view.
    await page.setViewportSize({ width: 1280, height: 720 });
    const cell = page.getByTestId("layout-cell-K_Q");
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await expect(page.getByTestId("key-edit-panel")).toBeVisible({ timeout: 30_000 });
    await expectInViewport(page, "layout-cell-K_Q", "selected key at 150% zoom");
    await expectInViewport(page, "key-edit-panel", "edit panel at 150% zoom");

    // 100% control: the same selection keeps both in view at full size.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await expect(page.getByTestId("key-edit-panel")).toBeVisible({ timeout: 30_000 });
    await expectInViewport(page, "layout-cell-K_Q", "selected key at 100%");
    await expectInViewport(page, "key-edit-panel", "edit panel at 100%");
  });
});
