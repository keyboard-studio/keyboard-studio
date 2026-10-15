/**
 * E2E: a Copy (Track 1) is a new keyboard and ships at 1.0 (spec 102 US1,
 * FR-004, FR-009, FR-011).
 *
 * Start keyboard: basic_kbdfr, whose own &KEYBOARDVERSION is 1.1 (not 1.0),
 * so a pass cannot come from the start keyboard's version leaking through.
 *
 * Flow under test:
 *   identity-lite -> base picker (basic_kbdfr) -> track choice (Copy)
 *     -> attribution -> project name -> prefill -> Phase B -> galleries
 *       -> Output
 *
 * Assertions:
 *   - the Output step's test-build control's description names version 0.1, which is test
 *     build 1 below a 1.0 publish version (it would be 0.1 for any source, so
 *     the zip assertions below carry the 1.0 claim);
 *   - the source .zip's file name is `<id>-1.0.zip`;
 *   - inside it, &KEYBOARDVERSION, the .kps <Version> and the newest HISTORY
 *     heading are all 1.0, and HISTORY records "Created from basic_kbdfr v1.1".
 *
 * Runs with `npx playwright test e2e/copy-version.spec.ts` from packages/studio.
 */

import { test, expect, type Page } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import * as fs from "node:fs";
import {
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveMechanismsGallery,
  navigateToOutput,
  triggerDownload,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const FIXTURE = {
  /** French Basic, &KEYBOARDVERSION '1.1' in ../keyboards. */
  startKeyboardId: "basic_kbdfr",
  startVersion: "1.1",
  autonym: "Test",
  english: "Test",
  targetScript: "Latn",
  charToAdd: "é",
};

/** Carve -> Deadkeys -> Rules -> Mechanisms, as the copy-edit walk does, so the Output gate opens. */
async function finishGalleryWork(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await expect(page.getByTestId("deadkeys-continue")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("deadkeys-continue").click();
  await page.getByTestId("rules-continue").click();
  await driveMechanismsGallery(page, {});
}

test.describe("spec 102 US1: a Copy starts at 1.0", () => {
  test("Copy of a 1.1 keyboard: Output and the downloaded package say 1.0", async ({ page }) => {
    // Skip the first-visit WelcomeScreen gate, as the copy-edit walk does.
    await seedReturningVisitor(page);
    await page.goto("/");
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });
    await page.waitForSelector('[data-testid="base-picker"]', { timeout: 90_000 });
    await pickStartKeyboard(page, FIXTURE.startKeyboardId);
    await chooseTrackCopy(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, FIXTURE.charToAdd);
    await finishGalleryWork(page);
    await navigateToOutput(page);

    // The Output step: test build 1 sits below a 1.0 publish version.
    const makeTestBuild = page.getByTestId("make-test-build");
    // Its name is its visible text; the version rides in its description.
    await expect(makeTestBuild).toHaveAccessibleDescription(/version 0\.1\b/, { timeout: 60_000 });

    const download = await triggerDownload(page);
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/-1\.0\.zip$/);

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const files = unzipSync(new Uint8Array(fs.readFileSync(dlPath!)));
    const text = (re: RegExp): string => {
      const name = Object.keys(files).find((n) => re.test(n));
      expect(name, `zip must contain ${re}`).toBeDefined();
      return strFromU8(files[name!]!);
    };

    const kmn = text(/source\/[^/]+\.kmn$/);
    expect(/store\(&KEYBOARDVERSION\)\s*'([^']*)'/i.exec(kmn)?.[1]).toBe("1.0");

    const kps = text(/source\/[^/]+\.kps$/);
    expect(/<Keyboards>[\s\S]*?<Keyboard>[\s\S]*?<Version>([^<]*)<\/Version>/.exec(kps)?.[1]).toBe("1.0");

    const history = text(/(^|\/)HISTORY\.md$/);
    expect(/^## (\S+) \(/m.exec(history)?.[1]).toBe("1.0");
    expect(history).toContain(`Created from ${FIXTURE.startKeyboardId} v${FIXTURE.startVersion} via keyboard-studio.`);
  });
});
