/**
 * E2E: LDML keyboard export (spec 108 User Story 1).
 *
 * Flow under test:
 *   Track 1 copy walk on a fixture keyboard (basic_kbdfr)
 *     -> Output page
 *       -> LDML panel: choose profile 46
 *         -> Download LDML
 *           -> assert the zip's entry list and that the report names the profile
 *
 * The LDML download is a third, separate download: the .kmp and source .zip are
 * not asserted here (they have their own specs) beyond the .zip carrying no LDML.
 *
 * Runs via the `playwright` package's CLI like the other e2e specs.
 */

import { test, expect, type Page } from "playwright/test";
import { strFromU8, unzipSync } from "fflate";
import * as fs from "node:fs";
import {
  driveIdentityLite,
  pickStartKeyboard,
  confirmCopyTrack,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveMechanismsGallery,
  navigateToPublish,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const FIXTURE = {
  startKeyboardId: "basic_kbdfr",
  autonym: "Test",
  english: "Test",
  targetScript: "Latn",
  charToAdd: "é",
};

/** Carve, Deadkeys, Rules and Mechanisms to completion, so the Output gate is open. */
async function finishGalleryWork(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await expect(page.getByTestId("deadkeys-continue")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("deadkeys-continue").click();
  await page.getByTestId("rules-continue").click();
  await driveMechanismsGallery(page, {});
}

test.describe("LDML export E2E", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("Output page: choose profile 46, download the LDML zip, and read its report", async ({ page }) => {
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });
    // A cold dev server enumerates the whole local keyboards clone before the picker appears.
    await page.waitForSelector('[data-testid="base-picker"]', { timeout: 90_000 });
    await pickStartKeyboard(page, FIXTURE.startKeyboardId);
    await confirmCopyTrack(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, FIXTURE.charToAdd);
    await finishGalleryWork(page);
    await navigateToPublish(page);

    // The LDML panel is its own region with a labelled profile picker; 46 is the default.
    const panel = page.getByTestId("ldml-download-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    const profile = page.getByLabel("LDML version");
    await profile.selectOption("46");
    await expect(profile).toHaveValue("46");

    const button = page.getByTestId("emit-download-ldml");
    await expect(button).not.toBeDisabled({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    expect(download.suggestedFilename()).toMatch(/_ldml-.+\.zip$/);

    const entries = unzipSync(new Uint8Array(fs.readFileSync(dlPath!)));
    const names = Object.keys(entries).sort();
    expect(names.some((n) => /^[^/]+\.kpj$/.test(n)), `entries: ${names.join(", ")}`).toBe(true);
    expect(names.some((n) => /^source\/[^/]+_ldml\.xml$/.test(n))).toBe(true);
    expect(names.some((n) => /^source\/[^/]+_ldml\.kps$/.test(n))).toBe(true);
    expect(names).toContain("LDML-EXPORT-REPORT.md");
    // The export is LDML only: no Keyman-native source rides along.
    expect(names.some((n) => n.endsWith(".kmn"))).toBe(false);

    const report = strFromU8(entries["LDML-EXPORT-REPORT.md"]!);
    expect(report).toContain("- Profile: 46 (namespace");
  });
});
