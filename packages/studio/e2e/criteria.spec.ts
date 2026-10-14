/**
 * E2E smoke (spec 084, plan §7 / T6.2): both criteria surfaces render.
 *
 * Authored: after establishing a working copy, the Criteria tab (route
 * `#criteria`, reached from the nav — the Output card drives the same
 * navigateTo) renders the full catalog with a summary header.
 *
 * Foreign: on the Compare tab, loading an existing keyboard and clicking
 * "Check criteria" renders the same catalog in foreign mode — 149 rows,
 * a judged-note, and NO attestation/confirmation controls (spec 057
 * FR-023: the foreign surface can judge, never record).
 */

import { test, expect, type Page } from "playwright/test";
import {
  acceptProjectName,
  chooseTrackCopy,
  confirmPrefill,
  driveAttributionStep,
  driveIdentityLite,
  pickStartKeyboard,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";

const OWN_BASE = "basic_kbdfr";
// A small catalog keyboard present in every catalog (and in the partial
// local keyboards checkout the dev server enumerates).
const FOREIGN_BASE = "basic_kbdus";

async function establishWorkingCopy(page: Page): Promise<void> {
  await driveIdentityLite(page, {
    english: "Test",
    autonym: "Test Autonym",
    script: "other",
  });
  await pickStartKeyboard(page, OWN_BASE);
  // The full instantiation sequence (the copy-edit walk's own order):
  // track choice → attribution → project name, then the base instantiates.
  await chooseTrackCopy(page);
  await driveAttributionStep(page);
  await acceptProjectName(page);
  await confirmPrefill(page);
  // The walk is now in Phase B with the base chosen and instantiated as
  // the working copy's starting point — the same state the survey's own
  // preview compiles from, and the state the criteria pipeline judges.
}

test.describe("Criteria page — authored surface (spec 084)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("Criteria tab renders the catalog for the author's own keyboard", async ({ page }) => {
    await establishWorkingCopy(page);

    await switchTab(page, "criteria");

    await expect(page.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("criteria-summary-resolved")).toContainText("of 149", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("criteria-row")).toHaveCount(149);
  });
});

test.describe("Criteria check — Compare surface (spec 084 US6)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("Check criteria judges a foreign keyboard with no record controls", async ({ page }) => {
    await establishWorkingCopy(page);

    await switchTab(page, "preview");
    const combobox = page.getByRole("combobox").first();
    await combobox.waitFor({ timeout: 60_000 });
    await combobox.click();
    await combobox.fill(FOREIGN_BASE);
    await page.locator(`[id$="-opt-${FOREIGN_BASE}"]`).first().click({ timeout: 30_000 });

    const button = page.getByTestId("compare-check-criteria");
    await expect(button).toBeEnabled({ timeout: 60_000 });
    await button.click();

    const panel = page.getByTestId("compare-criteria");
    await expect(panel.getByTestId("criteria-page")).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByTestId("criteria-judged-note")).toBeVisible();
    await expect(panel.getByTestId("criteria-row")).toHaveCount(149);

    // Foreign mode offers no way to record anything: expand a needs-author
    // row and a needs-human row — neither may show its controls.
    const needsAuthor = panel.locator('[data-testid="criteria-row"][data-status="needs-author"]').first();
    await needsAuthor.getByTestId("criteria-row-expand").click();
    await expect(panel.getByTestId("criteria-attest-controls")).toHaveCount(0);
    const needsHuman = panel.locator('[data-testid="criteria-row"][data-status="needs-human"]').first();
    await needsHuman.getByTestId("criteria-row-expand").click();
    await expect(panel.getByTestId("criteria-confirm-controls")).toHaveCount(0);
  });
});
