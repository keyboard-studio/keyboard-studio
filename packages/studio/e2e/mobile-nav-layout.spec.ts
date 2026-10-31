// Mobile nav layout — verifies the narrow-viewport shell geometry on Pixel 7.
//
// Mobile adaptation (Phase 6). Runs on the `mobile` project only
// (Pixel 7: 412×915 CSS px, touch, mobile). Asserts the mobile/touch premises
// first, then checks:
// - route navigation (one top row; the route links live in the Menu)
// - no horizontal overflow on every reachable top-level route
// - reachable controls (key controls are within the viewport, tappable,
//   and pass an elementFromPoint hit-test at their centre — the desktop
//   nav-layout.spec.ts pattern)
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

test("route links live in the top Menu; no bottom tab bar", async ({ page }) => {
  await page.goto("/#survey");

  // Desktop tab row hidden until the menu opens.
  await expect(page.getByRole("link", { name: "Compare" })).toHaveCount(0);
  await page.getByRole("button", { name: /^menu$/i }).tap();
  await expect(page.getByRole("link", { name: "Compare" })).toBeVisible();

  await expectNoSeriousAxeViolations(page, "mobile nav layout");
});

test("no horizontal overflow on the main routes", async ({ page }) => {
  // Every top-level route a returning visitor can reach from the narrow
  // Menu (navItems.ts) plus the landing and privacy routes — not just the
  // three routes the first pass covered.
  for (const route of [
    "/",
    "/#survey",
    "/#preview",
    "/#output",
    "/#trail",
    "/#criteria",
    "/#profile",
    "/#privacy",
  ]) {
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

  // The menu disclosure must be tappable. The visibility wait gets a
  // real window: on a cold dev server the shell's first render can take
  // well past the 5s default, which read as "Menu button never renders"
  // in the 2026-10-15 Phase 7 verification before passing on re-run.
  const overflow = page.getByRole("button", { name: /^menu$/i });
  await expect(overflow).toBeVisible({ timeout: 30_000 });
  const box = await overflow.boundingBox();
  expect(box, "overflow button must have a bounding box").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(412);
  // 44px touch target.
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Hit-test (the desktop nav-layout.spec.ts pattern): a pointer at the
  // control's centre must land on the control itself, not on an element
  // painted over it — a bounding box inside the viewport does not prove
  // the control is the one a tap actually reaches.
  async function hitTestCentre(locator: typeof overflow): Promise<boolean> {
    const targetBox = await locator.boundingBox();
    const handle = await locator.elementHandle();
    if (targetBox === null || handle === null) return false;
    // Identity is checked against the locator's own element handle, not a
    // selector re-query, so a same-named element elsewhere cannot pass it.
    return page.evaluate(
      ({ el, x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      },
      {
        el: handle,
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height / 2,
      },
    );
  }
  expect(
    await hitTestCentre(overflow),
    "Menu button must receive a pointer at its centre",
  ).toBe(true);

  // Same hit-test for a route link inside the opened Menu: the link a tap
  // aims at must be the element the tap lands on.
  await overflow.tap();
  const compareLink = page.getByRole("link", { name: "Compare" });
  await expect(compareLink).toBeVisible();
  expect(
    await hitTestCentre(compareLink),
    "Compare link must receive a pointer at its centre",
  ).toBe(true);

  await expectNoSeriousAxeViolations(page, "mobile reachable controls");
});
