/**
 * E2E: Track 1 (copy-edit) lane.
 *
 * Flow under test:
 *   identity-lite step
 *     -> base-keyboard picker (Track 1, copy-edit)
 *       -> track choice (copy)
 *         -> project-name step
 *           -> prefill confirmation
 *             -> Phase B (characters, build-list method)
 *               -> navigate to Output tab
 *                 -> wait for WASM compile (canDownload)
 *                   -> download .zip
 *                     -> assert .kmn + .kps + .kvks + welcome.htm present and non-empty
 *
 * Playwright runs via the global CLI (`npx playwright test`).
 * @playwright/test is NOT a devDependency; the global CLI resolves the runtime
 * import. This spec (like carve.spec.ts) imports from "playwright/test".
 *
 * refs #410 AC §3
 */

import { test, expect, type Page, type Download } from "playwright/test";
import { unzipSync } from "fflate";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE = {
  /** basic_kbdfr is a simple Latin keyboard; codec-clean and available in the
   *  local keyboard catalog served by the Vite dev server. */
  baseKeyboardId: "basic_kbdfr",
  /** Language name typed into identity-lite autonym field. */
  autonym: "Test",
  /** English name (seeded from autonym; we keep it the same). */
  english: "Test",
  /** ISO 639 language code — "fr" matches the base suggestion ranking. */
  languageCode: "fr",
  /** Target script — Latin is in-scope (non-CJK/Ethiopic). */
  targetScript: "Latn",
  /** A single character to add in Phase B build-list. */
  charToAdd: "é",
};

// ---------------------------------------------------------------------------
// Page-object helpers
// ---------------------------------------------------------------------------

/**
 * Walk the identity-lite step: answer all four required questions and click
 * the Finish button to advance to base-keyboard selection.
 */
async function fillIdentityLite(page: Page): Promise<void> {
  // Wait for the identity panel to be visible.
  await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 15_000 });

  // Q1: autonym (textarea, id="il_language_autonym")
  await page.fill("#il_language_autonym", FIXTURE.autonym);
  await page.click('[data-testid="survey-advance"]');

  // Q2: English name (textarea, id="il_language_english") — seeded with autonym.
  // Clear the seed and type our value for determinism.
  await page.waitForSelector("#il_language_english");
  await page.fill("#il_language_english", FIXTURE.english);
  await page.click('[data-testid="survey-advance"]');

  // Q3: ISO language code (text, id="il_language_code") — optional, fill anyway.
  await page.waitForSelector("#il_language_code");
  await page.fill("#il_language_code", FIXTURE.languageCode);
  await page.click('[data-testid="survey-advance"]');

  // Q4: Target script (select, id="il_target_script") — choose Latin.
  await page.waitForSelector("#il_target_script");
  await page.selectOption("#il_target_script", FIXTURE.targetScript);
  // This is the last question in the identity-lite flow (for non-CJK scripts);
  // the button becomes "Finish".
  await page.click('[data-testid="survey-advance"]');
}

/**
 * Pick the first suggested base keyboard from the BaseResolution step.
 * For "fr" language + Latin script, basic_kbdfr should appear as the top
 * language-match suggestion.
 */
async function pickBaseKeyboard(page: Page): Promise<void> {
  // Wait for base picker to appear.
  await page.waitForSelector('[data-testid="base-picker"]', { timeout: 20_000 });

  // Click the basic_kbdfr suggestion button (if present).
  const suggBtn = page.getByTestId(`base-card-${FIXTURE.baseKeyboardId}`);
  const fallbackBtn = page.getByTestId("base-picker").locator("button").first();

  if (await suggBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await suggBtn.click();
  } else {
    // Fallback: click the first available suggestion button.
    await fallbackBtn.click();
  }
}

/**
 * Choose "Copy" track and advance to project_name step.
 */
async function chooseTrackCopy(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="track-copy"]', { timeout: 15_000 });
  await page.click('[data-testid="track-copy"]');
  await page.click('[data-testid="track-next"]');
}

/**
 * Accept the pre-filled project name and advance.
 * (ProjectNameStep pre-fills from the identity autonym; we accept as-is.)
 */
async function acceptProjectName(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="project-name-next"]', { timeout: 15_000 });
  // The button is only enabled when the derived keyboard id is valid.
  await expect(page.getByTestId("project-name-next")).not.toBeDisabled({ timeout: 5_000 });
  await page.click('[data-testid="project-name-next"]');
}

/**
 * Confirm the prefill summary and advance to Phase B.
 */
async function confirmPrefill(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="prefill-confirm"]', { timeout: 15_000 });
  await page.click('[data-testid="prefill-confirm"]');
}

/**
 * Complete Phase B using the "Add your whole alphabet" method:
 * select the method, type one character, click Add, then click Done.
 */
async function completePhaseB(page: Page): Promise<void> {
  // Phase B IntroChooser is shown first. "Add your whole alphabet" is the
  // default selection — just click Continue.
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
  await page.click('[data-testid="phase-b-intro-next"]');

  // BuildListView — type a character and add it.
  await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
  await page.fill('[aria-label="Character to add"]', FIXTURE.charToAdd);
  await page.getByText("+ Add").click();

  // Click Done (enabled once at least one character is in the list).
  await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', {
    timeout: 5_000,
  });
  await page.click('[data-testid="phase-b-done"]');
}

/**
 * Navigate to the Output tab via the nav link.
 * The Output screen runs its own compile pipeline independently.
 * Wait until the download button is enabled (meaning WASM compile succeeded).
 */
async function navigateToOutput(page: Page): Promise<void> {
  // Click the "Output" nav link.
  await page.click('a[href="#output"]');
  await page.waitForSelector('[data-testid="output-screen-root"]', { timeout: 10_000 });
}

/**
 * Trigger the download and return the Download object.
 *
 * We set a generous timeout because the WASM compiler may still be initialising
 * on first load. The button becomes enabled when stage.kind === "ready", which
 * means the kmcmplib WASM compile completed without fatal errors.
 *
 * NOTE: usePreviewArtifact seeds baseKeyboard but leaves scaffoldSpec = null /
 * pickerMode = "open", so useKeyboardArtifact runs in open-base mode. The
 * compile signal therefore reflects the BASE keyboard (basic_kbdfr), not the
 * Track 1-scaffolded output. The downloaded .zip content is the working-copy
 * projection (correct), but the canDownload gate verifies the base keyboard
 * reached stage.kind === "ready". Strengthening this to verify the scaffolded
 * compile is a tracked follow-up (seed scaffoldSpec in usePreviewArtifact).
 */
async function triggerDownload(page: Page): Promise<Download> {
  // Wait for the download button to be enabled. This is the base-keyboard
  // compile-clean signal: canDownload = stage.kind === "ready" && isInstantiated,
  // and stage.kind reaches "ready" only after a successful kmcmplib compile of
  // the base keyboard in open-base mode (scaffoldSpec is null here).
  const downloadBtn = page.getByTestId("emit-download");
  await expect(downloadBtn).not.toBeDisabled({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadBtn.click(),
  ]);

  return download;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

test.describe("Track 1 (copy-edit) E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // The default hash-route is "survey" — we should land on the identity step.
  });

  test("walks identity-lite -> base picker -> project-name -> Phase B -> emit", async ({
    page,
  }) => {
    // Walk the wizard.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page);

    // Navigate to Output tab and trigger the download.
    await navigateToOutput(page);
    const download = await triggerDownload(page);

    // Verify the download event fired and produced a file.
    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();

    const zipBuf = fs.readFileSync(dlPath!);
    expect(zipBuf.length).toBeGreaterThan(100);

    // Verify the zip contains the expected keyboard source files. unzipSync
    // returns a { path: Uint8Array } map of the fully decompressed entries, so
    // each entry's byte length reflects real content size, not a header field.
    const entries = Object.entries(unzipSync(new Uint8Array(zipBuf)));

    // At minimum the .kmn source file must be present.
    const kmn = entries.find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "zip must contain a .kmn source file").toBeDefined();
    expect(kmn![1].length, ".kmn must be non-empty").toBeGreaterThan(0);

  });

  test("base keyboard compiles cleanly via kmcmplib WASM oracle (open-base mode)", async ({
    page,
  }) => {
    // Walk the full wizard and reach the Output screen.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page);
    await navigateToOutput(page);

    // The download button becoming enabled IS the compile-clean assertion for
    // the BASE keyboard (basic_kbdfr) in open-base mode:
    //   canDownload = (stage.kind === "ready") && isInstantiated
    // stage.kind reaches "ready" only when KmnCompiler.run() returns artifacts
    // without fatal/error diagnostics (see engine/src/compiler/index.ts).
    // If the WASM compile produced fatal errors the stage stays "error" and the
    // button remains disabled — which would cause the expect() below to fail.
    //
    // Scope note: usePreviewArtifact seeds baseKeyboard but leaves
    // scaffoldSpec = null / pickerMode = "open", so useKeyboardArtifact runs in
    // open-base mode. This test therefore verifies that basic_kbdfr itself
    // compiles clean, NOT that the Track 1-scaffolded output compiles clean.
    // Strengthening to verify the scaffolded compile is a tracked follow-up
    // (seed scaffoldSpec in usePreviewArtifact).
    const downloadBtn = page.getByTestId("emit-download");
    await expect(downloadBtn).not.toBeDisabled({ timeout: 60_000 });

    // Also verify that the button label indicates it is ready (not "Downloading…").
    await expect(downloadBtn).toHaveText("Download .zip");
  });

  test("emitted .kps, .kvks, and welcome.htm have non-empty bodies", async ({
    page,
  }) => {
    // Walk the wizard and download.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page);
    await navigateToOutput(page);
    const download = await triggerDownload(page);

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const zipBuf = fs.readFileSync(dlPath!);
    // unzipSync fully decompresses each entry into a Uint8Array; we assert on
    // the decompressed body length so "non-empty" reflects real content.
    const entries = Object.entries(unzipSync(new Uint8Array(zipBuf)));

    // Check for .kps
    const kps = entries.find(([name]) => name.endsWith(".kps"));
    expect(kps, "zip must contain a .kps package file").toBeDefined();
    expect(kps![1].length, ".kps must be non-empty").toBeGreaterThan(0);

    // Check for .kvks (visual keyboard source)
    const kvks = entries.find(([name]) => name.endsWith(".kvks"));
    expect(kvks, "zip must contain a .kvks visual keyboard file").toBeDefined();
    expect(kvks![1].length, ".kvks must be non-empty").toBeGreaterThan(0);

    // Check for welcome.htm
    const welcome = entries.find(
      ([name]) => path.basename(name).toLowerCase() === "welcome.htm",
    );
    expect(welcome, "zip must contain welcome.htm").toBeDefined();
    expect(welcome![1].length, "welcome.htm must be non-empty").toBeGreaterThan(0);
  });
});
