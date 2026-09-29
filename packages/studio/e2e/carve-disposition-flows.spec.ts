// E2E: carve allow/block disposition flows (spec 076 FR-005/FR-022/FR-023,
// issue #1802 amendments A1/A2/A3.1, task T023).
//
// Two flows through the real survey walk to the v2 carve gallery:
//   1. Sparse Latin overlay (sil_euro_latin, script Latn): recommended rows
//      pre-fill to allow-host ("bulk default" provenance) and the A2
//      symmetric banner/copy renders; the expanded host-consequence row and
//      the review panel are asserted.
//   2. Arabic base (arabic_izza, script Arab): recommended rows pre-fill to
//      block; flipping one row to allow-host stamps author-override
//      provenance without re-prompting.
//
// No screenshots: per author direction 2026-09-29, visual capture is out of
// scope — assertions carry the coverage.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test carve-disposition-flows.spec.ts
// With a system chromium instead of the downloaded bundle:
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/meta-chromium/chrome npx playwright test carve-disposition-flows.spec.ts

import { test, expect } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

// ---------------------------------------------------------------------------
// Shared page-object-lite steps
// ---------------------------------------------------------------------------

async function driveToCarveGallery(
  page: import("playwright/test").Page,
  opts: { script: string; baseKeyboard: string; char: string },
) {
  await seedReturningVisitor(page);
  await page.goto("/?e2e=1");
  await driveIdentityLite(page, {
    english: "Test",
    autonym: "Test Autonym",
    script: opts.script,
  });
  await pickBaseKeyboard(page, opts.baseKeyboard);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, opts.char);

  const carveGallery = page.getByTestId("carve-gallery");
  await expect(carveGallery).toBeVisible({ timeout: 60_000 });
  return carveGallery;
}

/** First per-row Allow/Block disposition control in the gallery. */
function firstDispositionControl(page: import("playwright/test").Page) {
  return page.getByTestId("carve-disposition-control").first();
}

async function pressedState(
  page: import("playwright/test").Page,
  control: import("playwright/test").Locator,
  name: string,
): Promise<string | null> {
  return control.getByRole("button", { name }).getAttribute("aria-pressed");
}

test.describe("Carve disposition flows (T023)", () => {
  test("sparse Latin overlay: rows pre-fill allow-host with the symmetric A2 copy", async ({
    page,
  }) => {
    await driveToCarveGallery(page, {
      script: "Latn",
      baseKeyboard: "sil_euro_latin",
      char: "a",
    });

    const control = firstDispositionControl(page);
    await expect(control).toBeVisible({ timeout: 30_000 });

    // FR-005 bulk default for a sparse Latin overlay: allow-host.
    expect(await pressedState(page, control, "Allow")).toBe("true");
    expect(await pressedState(page, control, "Block")).toBe("false");
    // A2: the required prompt and the selected option's own risk — never the
    // retired one-sided slogan. The control shows only the selected option's
    // risk (both risks render together in CarvedHostConsequences, asserted
    // below); the pre-fill here is allow-host, so the allow risk shows.
    await expect(control).toContainText("Do your typists expect a character on this key?");
    await expect(control).toContainText("Key does something, but output varies by computer.");
    await expect(control).not.toContainText("Allow means unpredictable");
    await expect(control).not.toContainText("Block means predictable");

    // Discard the row's character (single click toggles discard in v2), then
    // hover the cell to select it so the details pane shows the expanded
    // host-consequence row for the carved combo. Scope to the recommended
    // cards so the main-grid cells can't match first.
    const recCard = page
      .getByTestId(/carve-v2-(suggested|optional-latin)-group/)
      .first();
    const firstCell = recCard.locator('button[aria-label*="U+"]').first();
    await firstCell.click();
    await expect(firstCell).toHaveAttribute("aria-pressed", "true");
    await firstCell.hover();

    const consequences = page.getByTestId(/carve-host-consequences-/).first();
    await expect(consequences).toBeVisible({ timeout: 30_000 });
    // The honesty caption: best guesses, not sight into typists' machines.
    await expect(consequences).toContainText("best guess", { ignoreCase: true });
    // A2 symmetric copy: both options' risks render together here.
    await expect(consequences).toContainText("Key does something, but output varies by computer.");
    await expect(consequences).toContainText(
      "Key reliably does nothing, but becomes inaccessible/dead if typists expected a character.",
    );

    // Review panel: every carved combination with disposition + per-host
    // consequences, read-only.
    await page.getByTestId("carve-review-removed-keys").click();
    const dialog = page.getByTestId("review-removed-keys-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText("best guess", { ignoreCase: true });
  });

  test("Arabic base: rows pre-fill block; flipping one row stamps author-override", async ({
    page,
  }) => {
    await driveToCarveGallery(page, {
      script: "Arab",
      baseKeyboard: "arabic_izza",
      char: "ا",
    });

    const control = firstDispositionControl(page);
    await expect(control).toBeVisible({ timeout: 30_000 });

    // FR-005 bulk default for a non-Latin script: block.
    expect(await pressedState(page, control, "Allow")).toBe("false");
    expect(await pressedState(page, control, "Block")).toBe("true");

    // Flip one row to allow-host: the choice persists as an author override
    // and the risk copy updates with it.
    await control.getByRole("button", { name: "Allow" }).click();
    expect(await pressedState(page, control, "Allow")).toBe("true");
    await expect(control).toContainText("your override");
    await expect(control).toContainText("Key does something, but output varies by computer.");

    // Discard the flipped row's character and open the review panel.
    const recCard = page
      .getByTestId(/carve-v2-(suggested|optional-latin)-group/)
      .first();
    const firstCell = recCard.locator('button[aria-label*="U+"]').first();
    await firstCell.click();
    await expect(firstCell).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("carve-review-removed-keys").click();
    const dialog = page.getByTestId("review-removed-keys-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
  });
});
