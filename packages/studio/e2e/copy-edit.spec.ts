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
 * @playwright/test is NOT a devDependency — resolved at runtime by the CLI.
 *
 * refs #410 AC §3
 */

import { test, expect, type Page, type Download } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE = {
  /** base_kbdfr is a simple Latin keyboard; codec-clean and available in the
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
// Minimal ZIP entry scanner (no external dependency)
//
// Reads Local File Header entries from a raw ZIP buffer.
// Each entry is: PK\x03\x04 + 26 bytes fixed header + filename + extra + data.
// We extract filenames and the stored/compressed size so we can verify
// non-emptiness without fully decompressing the data.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

function scanZipEntries(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const LOCAL_SIG = 0x04034b50; // PK\x03\x04
  let offset = 0;

  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== LOCAL_SIG) {
      offset++;
      continue;
    }

    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const fileNameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameEnd = offset + 30 + fileNameLen;
    if (nameEnd > buf.length) break;
    const name = buf.subarray(offset + 30, nameEnd).toString("utf8");
    entries.push({ name, compressedSize, uncompressedSize });
    offset = nameEnd + extraLen + compressedSize;
  }

  return entries;
}

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
  await page.click('[data-testid="survey-next"]');

  // Q2: English name (textarea, id="il_language_english") — seeded with autonym.
  // Clear the seed and type our value for determinism.
  await page.waitForSelector("#il_language_english");
  await page.fill("#il_language_english", FIXTURE.english);
  await page.click('[data-testid="survey-next"]');

  // Q3: ISO language code (text, id="il_language_code") — optional, fill anyway.
  await page.waitForSelector("#il_language_code");
  await page.fill("#il_language_code", FIXTURE.languageCode);
  await page.click('[data-testid="survey-next"]');

  // Q4: Target script (select, id="il_target_script") — choose Latin.
  await page.waitForSelector("#il_target_script");
  await page.selectOption("#il_target_script", FIXTURE.targetScript);
  // This is the last question in the identity-lite flow (for non-CJK scripts);
  // the button becomes "Finish".
  await page.click('[data-testid="survey-finish"]');
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
  const suggBtn = page.getByTestId(`base-suggestion-${FIXTURE.baseKeyboardId}`);
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
 * Complete Phase B using the "Build my character list" method:
 * select the method, type one character, click Add, then click Done.
 */
async function completePhaseB(page: Page): Promise<void> {
  // Phase B IntroChooser is shown first. "Build my character list" is the
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
async function navigateToOutputAndWaitForCompile(page: Page): Promise<void> {
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
 */
async function triggerDownload(page: Page): Promise<Download> {
  // Wait for the download button to be enabled. This is the "WASM compiles
  // cleanly" signal: canDownload = stage.kind === "ready" && isInstantiated,
  // and stage.kind reaches "ready" only after a successful kmcmplib compile.
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
    await navigateToOutputAndWaitForCompile(page);
    const download = await triggerDownload(page);

    // Verify the download event fired and produced a file.
    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();

    const zipBuf = fs.readFileSync(dlPath!);
    expect(zipBuf.length).toBeGreaterThan(100);

    // Verify the zip contains the expected keyboard source files.
    const entries = scanZipEntries(zipBuf);
    const entryNames = entries.map((e) => e.name);

    // At minimum the .kmn source file must be present.
    const kmnEntry = entries.find((e) => e.name.endsWith(".kmn"));
    expect(kmnEntry, "zip must contain a .kmn source file").toBeDefined();
    expect(kmnEntry!.uncompressedSize, ".kmn must be non-empty").toBeGreaterThan(0);

    console.log("zip entries:", entryNames);
  });

  test("emitted .kmn compiles cleanly via kmcmplib WASM oracle", async ({
    page,
  }) => {
    // Walk the full wizard and reach the Output screen.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page);
    await navigateToOutputAndWaitForCompile(page);

    // The download button becoming enabled IS the compile-clean assertion:
    // canDownload = (stage.kind === "ready") && isInstantiated
    // stage.kind reaches "ready" only when KmnCompiler.run() returns artifacts
    // without fatal/error diagnostics (see engine/src/compiler/index.ts).
    // If the WASM compile produced fatal errors the stage stays "error" and the
    // button remains disabled — which would cause the expect() below to fail.
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
    await navigateToOutputAndWaitForCompile(page);
    const download = await triggerDownload(page);

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const zipBuf = fs.readFileSync(dlPath!);
    const entries = scanZipEntries(zipBuf);

    // Check for .kps
    const kpsEntry = entries.find((e) => e.name.endsWith(".kps"));
    expect(kpsEntry, "zip must contain a .kps package file").toBeDefined();
    expect(kpsEntry!.uncompressedSize, ".kps must be non-empty").toBeGreaterThan(0);

    // Check for .kvks (visual keyboard source)
    const kvksEntry = entries.find((e) => e.name.endsWith(".kvks"));
    expect(kvksEntry, "zip must contain a .kvks visual keyboard file").toBeDefined();
    expect(kvksEntry!.uncompressedSize, ".kvks must be non-empty").toBeGreaterThan(0);

    // Check for welcome.htm
    const welcomeEntry = entries.find((e) =>
      path.basename(e.name).toLowerCase() === "welcome.htm",
    );
    expect(welcomeEntry, "zip must contain welcome.htm").toBeDefined();
    expect(welcomeEntry!.uncompressedSize, "welcome.htm must be non-empty").toBeGreaterThan(0);
  });
});
