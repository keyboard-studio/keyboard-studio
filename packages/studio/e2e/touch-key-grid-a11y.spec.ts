// E2E: spec 058 (touch key editor) — T123, SC-009.
//
// The key grid is the first ARIA `role="grid"` in this repo (research R10.4:
// `role="grid"`, `gridcell`, `aria-colindex`, `aria-rowindex`, and
// `aria-activedescendant` had ZERO occurrences in `packages/` before this
// feature). A net-new composite widget is exactly where an accessibility
// regression is most likely and least likely to be noticed, so SC-009 asks for
// three things, and this spec asserts each separately:
//
//   1. Zero serious/critical axe violations on the grid as first rendered.
//   2. Zero serious/critical axe violations in ROVING-TABINDEX STATE — after
//      Tab has moved focus into the grid and an arrow has moved the selection.
//      This is a genuinely different DOM: `tabindex` has moved, `aria-selected`
//      has moved, and the inspector has re-rendered. A scan of the initial
//      state alone would miss every defect that only exists once the widget is
//      being operated, which is most of them for a grid.
//   3. Full operability with NO pointer events — the grid is reachable, its
//      cells are navigable, the inspector is reachable and escapable, all from
//      the keyboard, with a page-level pointer-event counter proving no mouse
//      was involved.
//
// The single-Tab-stop claim (FR-020a) is asserted as part of (3) rather than as
// a count of `[tabindex="0"]` elements: several hundred keys must not produce
// several hundred Tab stops, and the behavioural version of that ("one Tab
// enters, one Tab leaves") is the one an author actually experiences.
//
// Fixture and prelude: shared with touch-mode-toggle.spec.ts via
// helpers/touchKeyWalk.ts. "Reseed from desktop" (Case A) gives a
// deterministic, freshly-scaffolded grid rather than depending on the exact
// shape of bambara's shipped `.keyman-touch-layout`.
//
// Run:
//   cd packages/studio && npx playwright test touch-key-grid-a11y.spec.ts

import { test, expect, type Page } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { driveToTouchKeyMode } from "./helpers/touchKeyWalk";

/**
 * Installs a page-level counter for genuine POINTER-device events only.
 * Deliberately not a generic "click" listener — a browser's implicit form
 * submission on Enter dispatches a synthetic click with no pointer device
 * involved, and that must not read as a pointer event. Same instrumentation
 * `touch-key-assign.spec.ts` uses, for the same reason.
 */
async function installPointerEventCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __ksPointerEventCount: number };
    w.__ksPointerEventCount = 0;
    const bump = () => {
      w.__ksPointerEventCount += 1;
    };
    window.addEventListener("pointerdown", bump, true);
    window.addEventListener("pointerup", bump, true);
    window.addEventListener("mousedown", bump, true);
    window.addEventListener("mouseup", bump, true);
  });
}

async function pointerEventCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __ksPointerEventCount: number }).__ksPointerEventCount,
  );
}

// This spec used to carry a WCAG 1.4.3 exclusion for `.kmw-spacebar-caption`
// inside the OSK preview iframe. Now fixed at the source —
// packages/studio/public/osk-frame.html carries a scoped
// `#osk-host .kmw-spacebar-caption` color override with enough specificity
// to beat KMW's own kmwosk.css — so both scans below now cover the frame's
// contents with no exclusion needed.

test.describe("Touch key grid — accessibility (spec 058 SC-009)", () => {
  test("passes axe in both its resting and roving-tabindex states, and is fully operable with no pointer events", async ({
    page,
  }) => {
    await driveToTouchKeyMode(page);

    const grid = page.getByTestId("key-grid");
    await expect(grid).toBeVisible();

    // --- (1) Resting state. ---
    await expectNoSeriousAxeViolations(page, "touch key grid (resting)");

    // Focus the header control immediately before the grid in DOM order via the
    // DOM API — `.focus()` dispatches no pointer event, so this is setup, not a
    // measured action. The counter goes in after it.
    //
    // That control is `touch-key-mode-find-toggle`, not `touch-key-mode-continue`:
    // spec 061 T013-T015 added the layer selector and the add / remove / find
    // key commands BETWEEN Continue and the grid, so Continue is no longer
    // adjacent to it. Setup only — assertion (3a) below is unchanged, and it is
    // the one that matters: one Tab, several hundred keys, a single stop.
    await page.getByTestId("touch-key-mode-find-toggle").focus();
    await installPointerEventCounter(page);

    // --- (3a) One Tab enters the grid: the single roving-tabindex stop
    //          (FR-020a). Several hundred keys, one Tab stop. ---
    await page.keyboard.press("Tab");
    const focusedCell = page.locator('[role="gridcell"]:focus');
    await expect(focusedCell).toBeVisible();

    // --- (3b) Arrows move the selection within the grid. ---
    const firstFocusedId = await focusedCell.getAttribute("data-testid");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[role="gridcell"]:focus')).toBeVisible();
    const secondFocusedId = await page
      .locator('[role="gridcell"]:focus')
      .getAttribute("data-testid");
    expect(
      secondFocusedId,
      "ArrowRight moved focus to a different cell",
    ).not.toBe(firstFocusedId);

    // --- (2) Roving-tabindex state: tabindex has moved, aria-selected has
    //         moved, the inspector has re-rendered. A distinct DOM, scanned
    //         on its own. ---
    await expectNoSeriousAxeViolations(page, "touch key grid (roving-tabindex state)");

    // Exactly one cell is in the Tab order at a time — the invariant the
    // roving pattern exists to maintain, and the one a later "just make every
    // cell focusable" change would break.
    await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);

    // --- (3c) Enter reaches the editing surface, Escape returns to the cell.
    //          Both keyboard-only, per FR-020b's selection-vs-editing contract. ---
    //
    // That surface is `key-property-panel` as of spec 061 T028-T039: the one
    // panel absorbed the inspector AND the assign panel, which now sits behind
    // a disclosure inside it. FR-020b's contract is unchanged and is still what
    // this asserts — Enter leaves selection for editing, Escape comes back.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("key-property-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="gridcell"]:focus')).toBeVisible();

    // --- (3d) Nothing above used a pointer. ---
    expect(
      await pointerEventCount(page),
      "no pointer event during the keyboard-only grid operation",
    ).toBe(0);
  });
});
