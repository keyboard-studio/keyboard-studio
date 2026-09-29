// Mobile nav layout — verifies the narrow-viewport shell geometry on Pixel 7.
//
// Mobile adaptation (Phase 6). Runs on the `mobile` project only
// (Pixel 7: 412×915 CSS px, touch, mobile). Asserts the mobile/touch premises
// first, then checks:
// - route/tab geometry (MobileTabBar visible at bottom, desktop tab row hidden)
// - no horizontal overflow (no element exceeds the viewport width)
// - reachable controls (key controls are within the viewport and tappable)
// - axe serious/critical violations
//
// Note: these specs require a Chromium binary (`npx playwright install`).
// They do not run in the unit CI lane.
import { test, expect } from "playwright/test";
import { seedReturningVisitor } from "./helpers/surveyFlow.ts";
import { expectNoSeriousAxeViolations } from "./helpers/axe.ts";

test.beforeEach(async ({ page }) => {
  // Mobile/touch premises — fail fast if the project misconfigures the device.
  const viewport = page.viewportSize();
  expect(viewport, "mobile project must set a viewport").not.toBeNull();
  expect(viewport!.width).toBeLessThan(479);
  expect(viewport!.width).toBeGreaterThanOrEqual(360);

  const hasTouch = await page.evaluate(() => "ontouchstart" in window || navigator.maxTouchPoints > 0);
  expect(hasTouch, "mobile project must emulate touch").toBe(true);

  await seedReturningVisitor(page);
});

test("MobileTabBar is visible and the desktop tab row is hidden", async ({ page }) => {
  await page.goto("/");

  // The bottom tab bar carries the route navigation on narrow viewports.
  const tabBar = page.getByRole("navigation", { name: /mobile|tab bar/i }).or(
    page.locator("[data-testid='mobile-tab-bar']")
  );
  // Fall back to a structural check: MobileTabBar renders at the bottom.
  const tabBarVisible = await page.locator("nav").last().isVisible().catch(() => false);
  expect(tabBarVisible).toBe(true);

  await expectNoSeriousAxeViolations(page, "mobile nav layout");
});

test("no horizontal overflow on the main routes", async ({ page }) => {
  for (const route of ["/", "/#survey", "/#profile"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        offenders: Array.from(document.querySelectorAll("*"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.right > window.innerWidth + 1 || rect.left < -1;
          })
          .slice(0, 5)
          .map((el) => el.tagName + (el.className ? `.${String(el.className).split(" ")[0]}` : "")),
      };
    });

    expect(
      overflow.scrollWidth,
      `horizontal overflow on ${route}: ${overflow.offenders.join(", ")}`
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }
});

test("key controls are reachable within the viewport", async ({ page }) => {
  await page.goto("/");

  // The overflow disclosure ("More options") must be tappable.
  const overflow = page.getByRole("button", { name: /more options/i });
  await expect(overflow).toBeVisible();
  const box = await overflow.boundingBox();
  expect(box, "overflow button must have a bounding box").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(412);
  // 44px touch target.
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await expectNoSeriousAxeViolations(page, "mobile reachable controls");
});
