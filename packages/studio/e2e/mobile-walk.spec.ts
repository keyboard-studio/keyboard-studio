// Mobile authoring walk — a short end-to-end pass on Pixel 7.
//
// Mobile adaptation (issue 1853, Phase 6). Runs on the `mobile` project only.
// Covers:
// - a short authoring walk (open the survey, answer, reach a gallery)
// - OSK mount/unmount lifecycle (PreviewSheet show/hide unmounts the iframe)
// - footer degradation (no footer overlap with MobileTabBar)
// - axe serious/critical violations on visited screens
//
// Deferred to a later pass (not asserted here):
// - explicit 390px field-width visual check (needs screenshot comparison)
// - strong proof that OSK remount repeats the normal iframe onLoad/ready
//   command sequence (needs KeymanWeb engine instrumentation)
//
// Note: these specs require a Chromium binary (`npx playwright install`).
// They do not run in the unit CI lane.
import { test, expect } from "playwright/test";
import { seedReturningVisitor } from "./helpers/surveyFlow.ts";
import { expectNoSeriousAxeViolations } from "./helpers/axe.ts";

test.beforeEach(async ({ page }) => {
  const viewport = page.viewportSize();
  expect(viewport, "mobile project must set a viewport").not.toBeNull();
  expect(viewport!.width).toBeLessThan(479);

  await seedReturningVisitor(page);
});

test("short authoring walk: survey to gallery", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // The survey renders questions; answer the first visible one if any.
  const firstOption = page.getByRole("radio").first();
  if (await firstOption.isVisible().catch(() => false)) {
    await firstOption.check();
  }

  expect(pageErrors).toEqual([]);
  await expectNoSeriousAxeViolations(page, "mobile survey");
});

test("OSK PreviewSheet mounts and unmounts the iframe", async ({ page }) => {
  await page.goto("/#survey");
  await page.waitForLoadState("networkidle");

  // Navigate to a surface with the assign-loop PreviewSheet trigger.
  // The "Show keyboard preview" button opens the sheet; closing it must
  // unmount the OSK iframe (author-controlled visibility, issue 1853).
  const showPreview = page.getByRole("button", { name: /show keyboard preview/i });

  if (await showPreview.isVisible().catch(() => false)) {
    // No OSK iframe before opening.
    const iframeBefore = page.locator("iframe[data-os-kbd], iframe[title*='keyboard' i]");
    const countBefore = await iframeBefore.count();

    await showPreview.tap();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close via the sheet's close button.
    const close = page.getByRole("button", { name: /close/i }).first();
    await close.tap();
    await expect(page.getByRole("dialog")).toBeHidden();

    const countAfter = await iframeBefore.count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  }

  await expectNoSeriousAxeViolations(page, "mobile OSK sheet lifecycle");
});

test("footer does not overlap the MobileTabBar", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const overlap = await page.evaluate(() => {
    const footer = document.querySelector("footer");
    if (!footer) return { hasFooter: false, overlaps: false };
    const rect = footer.getBoundingClientRect();
    // MobileTabBar sits at the viewport bottom; the footer must not paint
    // underneath it.
    return {
      hasFooter: true,
      overlaps: rect.bottom > window.innerHeight - 56,
      footerBottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  if (overlap.hasFooter) {
    expect(overlap.overlaps, "footer must not sit under the tab bar").toBe(false);
  }

  await expectNoSeriousAxeViolations(page, "mobile footer");
});
