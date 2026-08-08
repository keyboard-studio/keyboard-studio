// E2E: switching layers must not multiply the grid's keys.
//
// The defect this guards, reported against the spec 061 remodel: "switch to
// shift and then back to default a few times, the spacing and keys at the
// front of the columns multiply."
//
// Cause: `KeyGridCellViewModel.address` is `touchKeyAddress(platform, layerId,
// key.id)` — derived from the id ALONE — and ids are not unique within a
// layer. Blank and spacer keys have nothing to name them, so real layouts
// repeat one id many times over (the shipped `sil_cameroon_azerty` layout
// carries `T_BLANK` twenty-five times and `K_SHIFT` twice inside one tablet
// layer; bambara's own `numeric` layer, the fixture below, repeats eleven
// ids). The grid used that address as its React `key`. React's keyed
// reconciliation maps the previous children BY key, so duplicates overwrite
// each other, the shadowed fibers are never matched on a later render and
// never enter the deletion set, and they stay mounted — a fresh pile of
// orphaned blanks and front-of-row keys on every layer switch.
//
// The fix is `KeyGridCellViewModel.cellKey` (keyGridViewModel.ts), an address
// disambiguated by its occurrence within the layer.
//
// The DURABLE guard is the vitest pair — `KeyGrid.test.tsx`'s "cells stay
// unique when key ids repeat within a layer" and `keyGridViewModel.test.ts`'s
// `cellKey` group — because the PR lane runs vitest and does not run
// Playwright (see touch-key-add-remove.spec.ts's standing note on that split).
// This spec exists because the report was a live-app one and a jsdom
// reconciliation test is not, on its own, evidence about a browser.
//
// Fixture: bambara, the same base every other touch spec uses. Its `numeric`
// layer is the one with repeated ids, so that is the layer this walk toggles
// to; `import-adapt` (not reseed), because the repeats live in the SHIPPED
// layout.

import { test, expect, type Page } from "playwright/test";
import { driveToTouchKeyMode } from "./helpers/touchKeyWalk";

/** Every real key cell — the row-actions strip carries no `aria-colindex`. */
function keyCells(page: Page) {
  return page.locator('[role="gridcell"][aria-colindex]');
}

/** Every decorative left-pad spacer — "the spacing" in the report. */
function padSpacers(page: Page) {
  return page.locator('[data-testid^="key-grid-pad-"]');
}

async function selectLayer(page: Page, layerId: string): Promise<void> {
  await page.getByTestId(`key-layer-selector-option-${layerId}`).click();
  await expect(page.getByTestId("key-grid")).toBeVisible();
}

test("switching layers back and forth leaves the key and spacer counts unchanged", async ({
  page,
}) => {
  await driveToTouchKeyMode(page, "import-adapt");

  await expect(page.getByTestId("key-layer-selector")).toBeVisible({
    timeout: 15_000,
  });

  // Baselines, taken once each on the first visit to the layer.
  const defaultCells = await keyCells(page).count();
  const defaultPads = await padSpacers(page).count();
  expect(defaultCells).toBeGreaterThan(0);

  await selectLayer(page, "numeric");
  const numericCells = await keyCells(page).count();
  const numericPads = await padSpacers(page).count();
  expect(numericCells).toBeGreaterThan(0);

  // "a few times" — three full round trips. Before the fix the counts grew on
  // every single switch, so even one round trip fails; three makes the growth
  // unmistakable in the failure message rather than borderline.
  for (let pass = 1; pass <= 3; pass++) {
    await selectLayer(page, "default");
    expect(await keyCells(page).count(), `default cells, pass ${pass}`).toBe(
      defaultCells,
    );
    expect(await padSpacers(page).count(), `default pads, pass ${pass}`).toBe(
      defaultPads,
    );

    await selectLayer(page, "numeric");
    expect(await keyCells(page).count(), `numeric cells, pass ${pass}`).toBe(
      numericCells,
    );
    expect(await padSpacers(page).count(), `numeric pads, pass ${pass}`).toBe(
      numericPads,
    );
  }
});
