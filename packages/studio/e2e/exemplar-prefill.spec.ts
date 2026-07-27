// E2E: Phase B propose-then-confirm exemplar prefill (spec 044 FR-016/FR-017).
//
// Two walks, one per side of the decision:
//
//   accept  — SC-008/SC-010. A language the pinned index covers reaches a
//             recorded alphabet in TWO actions (Continue, then Done) with ZERO
//             characters typed. This is the whole point of the feature: for a
//             covered language, producing an alphabet stops being data entry.
//
//   decline — SC-009. Choosing to build the list by hand records only what the
//             author typed, and re-entering Phase B does not re-assert the set.
//
// Both drive the REAL sourcing path — the studio reads the committed offline
// index, so no network and no fixture stubbing is involved. The language is
// Ewondo (`ewo`), which CLDR covers with all four exemplar tiers.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test exemplar-prefill.spec.ts

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const BASE_KEYBOARD_ID = "basic_kbdfr";

/** Identity answers that resolve the target language to Ewondo. */
const EWONDO = { english: "Ewondo", autonym: "Ewondo", script: "Latn" };

/**
 * Drive the walk from a fresh visitor up to the Phase B IntroChooser.
 * Everything before Phase B is shared by both walks and is covered in depth by
 * the other specs — this only needs it to arrive.
 */
async function reachPhaseBChooser(page: Page): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, EWONDO);
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 30_000 });
}

/** The exemplar option's radio, or null when no inventory was offered. */
function exemplarOption(page: Page) {
  return page.locator("#discovery_method-exemplars");
}

test.describe("Phase B exemplar prefill", () => {
  test("accept: two actions, alphabet recorded, zero characters typed (SC-008/SC-010)", async ({
    page,
  }) => {
    await reachPhaseBChooser(page);

    // The offer is present, pre-selected, and shows its evidence inline —
    // the author can see what they are accepting before they accept it.
    await expect(exemplarOption(page)).toBeChecked();
    const detail = page.getByTestId("exemplar-offer-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("CLDR");
    // The preview elides after a couple of dozen characters, so assert on
    // Ewondo-distinctive letters that fall INSIDE it, plus the elision marker.
    const preview = page.getByTestId("exemplar-offer-preview");
    await expect(preview).toContainText("ə");
    await expect(preview).toContainText("ɛ");
    await expect(preview).toContainText("more");

    // Action 1: Continue.
    await page.click('[data-testid="phase-b-intro-next"]');

    // Page 2 arrives PREFILLED. Nothing has been typed into the character box.
    const done = page.locator('[data-testid="phase-b-done"]');
    await expect(done).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("phase-b-heading")).toContainText("Confirm your alphabet");
    await expect(page.locator('[aria-label="Character to add"]')).toHaveValue("");
    await expect(page.getByTestId("proposed-char-chip").first()).toBeVisible();

    // The proposal is attributed, per character.
    await expect(page.getByTestId("proposed-chip-legend")).toContainText("CLDR");
    await expect(page.getByTestId("proposed-char-chip").first()).toHaveAttribute(
      "title",
      /from CLDR/,
    );

    // Action 2: Done. Two actions total, zero characters typed.
    await done.click();
    await expect(page.locator('[data-testid="phase-b-intro-next"]')).toHaveCount(0);
  });

  test("decline: records only what the author typed, and does not re-assert (SC-009)", async ({
    page,
  }) => {
    await reachPhaseBChooser(page);
    await expect(exemplarOption(page)).toBeChecked();

    // Choose to build the list by hand instead — a first-class choice.
    await page.click("#discovery_method-build-list");
    await page.click('[data-testid="phase-b-intro-next"]');

    // Page 2 arrives EMPTY.
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 15_000 });
    await expect(page.getByTestId("proposed-char-chip")).toHaveCount(0);
    await expect(page.locator('[data-testid="phase-b-done"]')).toBeDisabled();
    await expect(page.getByTestId("phase-b-heading")).toContainText("Add your whole alphabet");

    // Declining is not a dead end: the proposal is still one click away,
    // collapsed (FR-016b).
    await expect(page.getByTestId("exemplar-apply-affordance")).toBeVisible();
    await expect(page.getByTestId("exemplar-apply-confirm")).toHaveCount(0);

    // The author types their own alphabet.
    await page.fill('[aria-label="Character to add"]', "q");
    await page.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByTestId("authored-char-chip")).toHaveCount(1);
    // Nothing was proposed, so nothing claims to have been.
    await expect(page.getByTestId("proposed-char-chip")).toHaveCount(0);
    await expect(page.getByTestId("proposed-chip-legend")).toHaveCount(0);

    // Re-entering Phase B does not re-assert the exemplar set as the default
    // (FR-016a) — the decline is remembered.
    await page.getByRole("button", { name: "Back" }).first().click();
    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
    await expect(exemplarOption(page)).not.toBeChecked();
    await expect(page.locator("#discovery_method-build-list")).toBeChecked();
    // Still offered, though — declining once is not a permanent removal.
    await expect(exemplarOption(page)).toBeVisible();
  });
});
