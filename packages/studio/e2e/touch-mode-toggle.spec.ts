// E2E: spec 063 (touch key editor) — T124, SC-011's Playwright half.
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

async function switchTo(
  page: Page,
  mode: "character" | "key" | "code",
): Promise<void> {
  await page.getByTestId(`touch-mode-tab-${mode}`).click();
  const tab = page.getByTestId(`touch-mode-tab-${mode}`);
  await expect(tab).toHaveAttribute("aria-selected", "true");
  // Exactly one pane is mounted at a time (view swap, not a fork).
  await expect(page.getByTestId("touch-builder-pane")).toBeVisible({
    visible: mode === "key",
  });
  await expect(page.getByTestId("touch-code-pane")).toBeVisible({
    visible: mode === "code",
  });
}

/**
 * Do real by-key work through the TouchBuilderPane: select the first canvas
 * key and edit its keycap text via the toolbar field (commits a `set {text}`
 * op on blur). Bounded, and fails loudly if no key is reachable — the walk
 * would otherwise "pass" having committed no state, which is the one way
 * this spec could lie.
 */
async function editKeyTextInBuilder(page: Page): Promise<string> {
  const canvas = page.getByTestId("touch-builder-canvas");
  await expect(canvas).toBeVisible();
  const firstKey = canvas.locator('[data-address]').first();
  await expect(firstKey).toBeVisible();
  const address = (await firstKey.getAttribute("data-address")) ?? "";
  expect(address, "canvas key must carry a data-address").not.toBe("");
  await firstKey.click();
  const textField = page.getByTestId("touch-builder-field-text");
  await expect(textField).toBeVisible();
  await textField.fill("ɛ");
  await textField.blur();
  return address;
}

test.describe("Touch editor mode toggle — no state is lost (spec 063 SC-011)", () => {
  test("switches across all three tabs preserve the by-key work, and the shared figures agree in every view at every stop", async ({
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

    // --- Real by-key work: edit a key's text in the builder. ---
    const editedAddress = await editKeyTextInBuilder(page);
    const editedKey = page.locator(`[data-address="${editedAddress}"]`);
    await expect(editedKey).toContainText("ɛ");

    const afterEdit = await readProgressFigures(page);

    // --- Switches across all three tabs, deliberately mixed and ending in
    //     the code tab (not where the work was done). At every stop: the
    //     figures still agree, and the edited key is still there whenever
    //     the builder is showing. ---
    const sequence: Array<"character" | "key" | "code"> = [
      "character",
      "code",
      "key",
      "code",
      "character",
      "code",
    ];
    for (const [i, mode] of sequence.entries()) {
      await switchTo(page, mode);

      const figures = await readProgressFigures(page);
      expect(
        figures,
        `shared figures disagreed after switch ${i + 1} (to ${mode})`,
      ).toEqual(afterEdit);

      if (mode === "key") {
        // The overlay's work is still projected into the builder — nothing
        // was cleared as a side effect of the mode change (FR-036a/b). This
        // is the tidy-up someone adds later, so it is asserted every time
        // the builder is visible, not once at the end.
        await expect(
          editedKey,
          `the edited key vanished after switch ${i + 1}`,
        ).toContainText("ɛ");
      }
    }

    // --- Ending in the code tab: switch back to key one final time and the
    //     work is still there. ---
    await switchTo(page, "key");
    await expect(editedKey).toContainText("ɛ");
    expect(await readProgressFigures(page)).toEqual(afterEdit);
  });
});
