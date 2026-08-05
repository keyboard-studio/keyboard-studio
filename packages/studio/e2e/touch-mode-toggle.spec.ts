// E2E: spec 058 (touch key editor) — T124, SC-011's Playwright half.
//
// SC-011 has two halves and they are not redundant:
//
//   * The STORE half (T078, `workingCopyStore.test.ts`) proves that
//     `setTouchEditorMode` clears nothing — neither `touchDraft` nor
//     `keyEditOverlay` — however many times it is called, in any order. It
//     tests the reducer.
//   * This half proves the same thing about the ASSEMBLED PRODUCT: real work
//     committed in each mode, real tab clicks, and the state still there
//     afterwards. A store that preserves state is necessary but not
//     sufficient — the gallery could still remount a pane, reset a memo, or
//     re-derive a figure differently per mode, and none of that is visible from
//     the reducer's own test.
//
// The two claims asserted here (FR-036a, FR-036b, FR-036d):
//
//   1. N mode switches in any order lose no state. Work done in the key view is
//      still there after switching away and back — repeatedly, and ending on
//      the mode the walk did NOT start in, so a "state survives a round trip"
//      implementation that only works for an even number of switches fails.
//   2. The shared progress figures never disagree between views. They are two
//      projections of one truth (FR-036d: "MUST NOT be independently maintained
//      counters that can disagree"), so they are read in BOTH panes at every
//      stop and compared — not read once and trusted.
//
// Fixture and prelude: shared with touch-key-grid-a11y.spec.ts via
// helpers/touchKeyWalk.ts.
//
// Run:
//   cd packages/studio && npx playwright test touch-mode-toggle.spec.ts

import { test, expect, type Page } from "playwright/test";
import {
  driveToTouchStep,
  enterTouchKeyMode,
} from "./helpers/touchKeyWalk";

/** The task's own worked example — assigned through AssignPanel's field. */
const ASSIGNED_NOTATION = "U+025B";
const ASSIGNED_KEY_ID = "U_025B";

/** Both shared progress figures, as the author reads them. */
interface ProgressFigures {
  readonly unplaced: string;
  readonly noOutputKeys: string;
}

async function readProgressFigures(page: Page): Promise<ProgressFigures> {
  const unplaced = page.getByTestId("touch-progress-unplaced");
  const noOutputKeys = page.getByTestId("touch-progress-no-output-keys");
  await expect(unplaced).toBeVisible();
  await expect(noOutputKeys).toBeVisible();
  return {
    unplaced: (await unplaced.textContent()) ?? "",
    noOutputKeys: (await noOutputKeys.textContent()) ?? "",
  };
}

async function switchTo(page: Page, mode: "character" | "key"): Promise<void> {
  await page.getByTestId(`touch-mode-tab-${mode}`).click();
  const tab = page.getByTestId(`touch-mode-tab-${mode}`);
  await expect(tab).toHaveAttribute("aria-selected", "true");
  if (mode === "key") {
    await expect(page.getByTestId("key-grid")).toBeVisible();
  } else {
    await expect(page.getByTestId("key-grid")).toBeHidden();
  }
}

/**
 * Assign a character to a key through the grid's own keyboard route — the same
 * sequence SC-004 measures, reused here purely to create real by-key state
 * worth losing.
 *
 * The first cell the roving tabindex lands on is not necessarily assignable
 * (a reseeded layout's leading key is typically a frame key, for which
 * AssignPanel offers no character field at all), so this steps right until the
 * field appears rather than assuming a fixed number of arrows. Bounded, and it
 * fails loudly rather than silently doing nothing if no assignable key is
 * reachable — the walk would otherwise "pass" having committed no state, which
 * is the one way this spec could lie.
 */
async function assignCharacterToAKey(page: Page): Promise<void> {
  await page.getByTestId("touch-key-mode-continue").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="gridcell"]:focus')).toBeVisible();

  const charField = page.getByLabel("Character or code point");
  const MAX_STEPS = 12;
  let found = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    await page.keyboard.press("Enter");
    if (await charField.isVisible().catch(() => false)) {
      found = true;
      break;
    }
    // Not assignable — return focus to the grid and try the next key.
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowRight");
  }
  expect(found, `no assignable key within ${MAX_STEPS} cells of the grid start`).toBe(true);

  await expect(charField).toBeFocused();
  await charField.fill(ASSIGNED_NOTATION);
  await expect(page.getByTestId("assign-panel-confirm")).toBeEnabled();
  await page.keyboard.press("Enter");
  // The field resets on a successful commit — a real signal the commit landed.
  await expect(charField).toHaveValue("");
}

test.describe("Touch editor mode toggle — no state is lost (spec 058 SC-011)", () => {
  test("five switches in mixed order preserve the by-key work, and the shared figures agree in both views at every stop", async ({
    page,
  }) => {
    await driveToTouchStep(page);

    // Figures are visible in the character pane from the start (T075) — read
    // them here so a later comparison has a pre-edit baseline.
    const characterModeBefore = await readProgressFigures(page);

    await enterTouchKeyMode(page);
    const keyModeBefore = await readProgressFigures(page);
    expect(
      keyModeBefore,
      "the shared figures must read the same in both views BEFORE any edit",
    ).toEqual(characterModeBefore);

    // --- Real by-key work: assign ɛ to a key. ---
    await assignCharacterToAKey(page);
    // Matched by the id SUFFIX rather than a full `platform:layer:id` address:
    // which cell `assignCharacterToAKey` landed on depends on the reseeded
    // layout's shape, and the point of the assertion is that the assigned key
    // is still THERE — not where it happens to sit.
    const assignedCell = page.locator(
      `[data-testid^="key-grid-cell-"][data-testid$=":${ASSIGNED_KEY_ID}"]`,
    );
    await expect(assignedCell).toBeVisible();

    const afterEdit = await readProgressFigures(page);

    // --- Five switches, deliberately ODD and mixed, ending in the mode the
    //     walk did not start in. At every stop: the figures still agree, and
    //     the assigned key is still there when the grid is showing. ---
    const sequence: Array<"character" | "key"> = [
      "character",
      "key",
      "character",
      "key",
      "character",
    ];
    for (const [i, mode] of sequence.entries()) {
      await switchTo(page, mode);

      const figures = await readProgressFigures(page);
      expect(
        figures,
        `shared figures disagreed after switch ${i + 1} (to ${mode})`,
      ).toEqual(afterEdit);

      if (mode === "key") {
        // The overlay's work is still projected into the grid — nothing was
        // cleared as a side effect of the mode change (FR-036a/b). This is the
        // tidy-up someone adds later, so it is asserted every time the grid is
        // visible, not once at the end.
        await expect(
          assignedCell,
          `the assigned key vanished after switch ${i + 1}`,
        ).toBeVisible();
      }
    }

    // --- Ending in character mode (an odd number of switches from the key
    //     view where the work was done): switch back one final time and the
    //     work is still there. ---
    await switchTo(page, "key");
    await expect(assignedCell).toBeVisible();
    expect(await readProgressFigures(page)).toEqual(afterEdit);
  });
});
