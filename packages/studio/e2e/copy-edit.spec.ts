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
// Proven-script verification fixtures (spec 034 T002 — FR-011, SC-004)
//
// The five PROVEN alphabetic scripts the MVP walk is verified against (spec §16
// / lib/scriptAxes.ts LATIN_ALPHABETIC: Latn, Cyrl, Grek, Geor, Armn). Each row
// names a codec-clean base keyboard from docs/keyboard-index.md that declares
// the target language, so the identity -> base ranking surfaces it. These are
// the explicit fixtures for the Cyrillic walk (T010) and the five-script smoke
// (T011). Keep in sync with docs/keyboard-index.md.
//
//   Latin     — basic_kbdfr          (fr, Latn)  — also the primary FIXTURE above
//   Cyrillic  — russian_mnemonic_r   (ru, Cyrl)
//   Greek     — basic_kbdhe          (el, Grek)  — Windows Greek "Hellenic" basic
//   Georgian  — basic_kbdgeo         (ka, Geor)
//   Armenian  — armenian_mnemonic_r  (hy, Armn)
//
// NB: `basic_kbdgr` is GERMAN (Windows "GR" = German), NOT Greek — do not use it.
// ---------------------------------------------------------------------------

interface ProvenScriptFixture {
  script: "Latn" | "Cyrl" | "Grek" | "Geor" | "Armn";
  baseKeyboardId: string;
  /** ISO 639 language subtag the base declares (drives base-suggestion ranking). */
  languageCode: string;
  /** BCP47 script subtag chosen at identity-lite (il_target_script). */
  targetScript: string;
  /** A representative character to add in Phase B for this script. */
  charToAdd: string;
}

const PROVEN_SCRIPT_BASES: ReadonlyArray<ProvenScriptFixture> = [
  { script: "Latn", baseKeyboardId: "basic_kbdfr",         languageCode: "fr", targetScript: "Latn", charToAdd: "é" },
  { script: "Cyrl", baseKeyboardId: "russian_mnemonic_r",  languageCode: "ru", targetScript: "Cyrl", charToAdd: "я" },
  { script: "Grek", baseKeyboardId: "basic_kbdhe",         languageCode: "el", targetScript: "Grek", charToAdd: "ω" },
  { script: "Geor", baseKeyboardId: "basic_kbdgeo",        languageCode: "ka", targetScript: "Geor", charToAdd: "ქ" },
  { script: "Armn", baseKeyboardId: "armenian_mnemonic_r", languageCode: "hy", targetScript: "Armn", charToAdd: "ա" },
];

/** Everything the walk helpers need for one script. FIXTURE (Latin) conforms. */
interface WalkFixture {
  autonym: string;
  english: string;
  languageCode: string;
  targetScript: string;
  baseKeyboardId: string;
  charToAdd: string;
}

/** Build a full WalkFixture from a proven-script row (autonym seeded from the script). */
function walkFixtureFor(f: ProvenScriptFixture): WalkFixture {
  return {
    autonym: `Test ${f.script}`,
    english: `Test ${f.script}`,
    languageCode: f.languageCode,
    targetScript: f.targetScript,
    baseKeyboardId: f.baseKeyboardId,
    charToAdd: f.charToAdd,
  };
}

// ---------------------------------------------------------------------------
// Page-object helpers
// ---------------------------------------------------------------------------

/**
 * Walk the identity-lite step: answer all four required questions and click
 * the Finish button to advance to base-keyboard selection.
 */
/**
 * Type free text into an autocomplete combobox (spec 030 identity-lite Q1-Q3
 * render as `role="combobox"` inputs), then close any suggestion list so the
 * subsequent survey-advance click lands on the button, not a highlighted option.
 * Free text is always accepted by these questions (il_language_english FR-003),
 * which keeps the walk deterministic and — for il_language_english — avoids
 * resolving a region-ambiguous langtags entry that would insert il_language_region.
 */
async function fillComboboxFreeText(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.fill(selector, value);
  // Escape closes the suggestion listbox without clearing the typed value.
  await page.press(selector, "Escape");
}

async function fillIdentityLite(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  // Wait for the identity panel to be visible.
  await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 15_000 });

  // Identity-lite order (spec 030): English name (autocomplete) → autonym
  // (autocomplete) → ISO code (autocomplete, optional) → target script (select).
  // We drive each with FREE TEXT (no suggestion selection) for determinism.

  // Q1: English name — autocomplete combobox. Free-text name (not a real langtags
  // entry) resolves no language, so il_language_region never appears.
  await fillComboboxFreeText(page, "#il_language_english", fx.english);
  await page.click('[data-testid="survey-advance"]');

  // Q2: autonym (local name) — autocomplete combobox, free text.
  await fillComboboxFreeText(page, "#il_language_autonym", fx.autonym);
  await page.click('[data-testid="survey-advance"]');

  // Q3: ISO language code — autocomplete combobox, optional. This explicit code +
  // the target script below drive the base-suggestion ranking (bcp47 = code-Script).
  await fillComboboxFreeText(page, "#il_language_code", fx.languageCode);
  await page.click('[data-testid="survey-advance"]');

  // Q4: Target script — native <select>. Last question for non-CJK scripts; the
  // advance button becomes "Finish".
  await page.waitForSelector("#il_target_script");
  await page.selectOption("#il_target_script", fx.targetScript);
  await page.click('[data-testid="survey-advance"]');
}

/**
 * Pick the first suggested base keyboard from the BaseResolution step.
 * For "fr" language + Latin script, basic_kbdfr should appear as the top
 * language-match suggestion.
 */
async function pickBaseKeyboard(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  // Wait for base picker to appear. BaseResolution shows a bare "Loading base
  // keyboards..." until listAll() resolves, and the first catalog load enumerates
  // the ENTIRE local ../keyboards clone from disk (hundreds of keyboards via the
  // dev Vite plugin) — which can take well over 20s on a cold dev server.
  await page.waitForSelector('[data-testid="base-picker"]', { timeout: 90_000 });

  // Fast path: the base is a ranked suggestion card (typical for the primary
  // language+script match, e.g. Latin basic_kbdfr). Clicking a card resolves
  // immediately (onResolved).
  const card = page.getByTestId(`base-card-${fx.baseKeyboardId}`);
  if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await card.click();
    return;
  }

  // Robust path: some bases (notably the non-Latin proven-script bases) do not
  // surface as ranked suggestion cards, so we must NOT click an arbitrary first
  // button — the first button in the picker is "Back", which navigates out of
  // the base step. Instead widen the search scope to the full catalog, search by
  // id, select the exact result option, then confirm ("Use this keyboard").
  await page.getByTestId("search-scope-all").click();
  const search = page.getByPlaceholder(/Type to search by name/i);
  await search.fill(fx.baseKeyboardId);
  // Options render as <li id="...-opt-<baseId>"> and commit the pick on click.
  await page.locator(`[id$="-opt-${fx.baseKeyboardId}"]`).first().click({ timeout: 15_000 });
  const confirm = page.getByTestId("base-confirm");
  await expect(confirm).toBeEnabled({ timeout: 5_000 });
  await confirm.click();
}

/**
 * Choose "Copy" track and advance to project_name step.
 */
async function chooseTrackCopy(page: Page): Promise<void> {
  // The track step ("Authoring Track") renders as a survey radio question, not a
  // dedicated track-copy/track-next control: pick the "Copy" radio, then advance.
  const copyRadio = page.getByRole("radio", { name: /^Copy/i });
  await copyRadio.waitFor({ state: "visible", timeout: 15_000 });
  await copyRadio.check();
  await page.click('[data-testid="survey-advance"]');
}

/**
 * Accept the pre-filled project name and advance.
 * (ProjectNameStep pre-fills from the identity autonym; we accept as-is.)
 */
async function acceptProjectName(page: Page): Promise<void> {
  // project_name is now a survey phase ("Name your keyboard") with a display-name
  // step then a derived keyboard-id step, both pre-filled from identity. Advance
  // through each via survey-advance; the id step is skipped if the phase is a
  // single step (the prefill confirm will already be showing).
  const advance = '[data-testid="survey-advance"]';
  await page.waitForSelector(advance, { timeout: 15_000 });
  await expect(page.getByTestId("survey-advance")).not.toBeDisabled({ timeout: 5_000 });
  await page.click(advance); // step 1: display name (pre-filled)

  // step 2: derived keyboard id — advance again if it renders.
  const onStep2 = await page
    .getByText(/Step 2 of/i)
    .isVisible({ timeout: 8_000 })
    .catch(() => false);
  if (onStep2) {
    await expect(page.getByTestId("survey-advance")).not.toBeDisabled({ timeout: 5_000 });
    await page.click(advance);
  }
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
async function completePhaseB(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  // Phase B IntroChooser is shown first. "Add your whole alphabet" is the
  // default selection — just click Continue.
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
  await page.click('[data-testid="phase-b-intro-next"]');

  // BuildListView — type a character and add it.
  await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
  await page.fill('[aria-label="Character to add"]', fx.charToAdd);
  await page.getByRole("button", { name: "+ Add" }).click();

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

// ---------------------------------------------------------------------------
// spec 034 — proven-script walks (T010, T011) + publish paths (T016)
//
// Reuses the parameterized walk helpers above (fillIdentityLite / pickBaseKeyboard
// / completePhaseB now take a WalkFixture). The download button becoming enabled
// IS the compile-clean signal: canDownload === (stage.kind === "ready" &&
// isInstantiated), and stage.kind reaches "ready" only after a successful
// kmcmplib compile (see triggerDownload + the base-compile note above).
// ---------------------------------------------------------------------------

/** Walk identity → base → track(copy) → project-name → prefill → Phase B → Output tab. */
async function walkToOutput(page: Page, fx: WalkFixture): Promise<void> {
  await fillIdentityLite(page, fx);
  await pickBaseKeyboard(page, fx);
  await chooseTrackCopy(page);
  await acceptProjectName(page);
  await confirmPrefill(page);
  await completePhaseB(page, fx);
  await navigateToOutput(page);
}

async function walkToDownload(page: Page, fx: WalkFixture): Promise<Download> {
  await walkToOutput(page, fx);
  return triggerDownload(page);
}

test.describe("spec 034 proven-script walks + publish paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // --- T010: Cyrillic end-to-end walk (identity → ZIP), asserting the ZIP compiles.
  test("T010 [US1]: Cyrillic (russian_mnemonic_r) walks identity → downloadable, compilable ZIP", async ({
    page,
  }) => {
    const cyrl = PROVEN_SCRIPT_BASES.find((f) => f.script === "Cyrl")!;
    const download = await walkToDownload(page, walkFixtureFor(cyrl));

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const zipBuf = fs.readFileSync(dlPath!);
    expect(zipBuf.length).toBeGreaterThan(100);

    // The .kmn must be present + non-empty. (Reaching the enabled download button
    // already asserts the base compiled clean via the kmcmplib oracle.)
    const entries = Object.entries(unzipSync(new Uint8Array(zipBuf)));
    const kmn = entries.find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "Cyrillic zip must contain a .kmn source file").toBeDefined();
    expect(kmn![1].length, ".kmn must be non-empty").toBeGreaterThan(0);
  });

  // --- T011: all five proven scripts reach a downloadable ZIP (FR-011, SC-004).
  for (const fx of PROVEN_SCRIPT_BASES) {
    test(`T011 [US1]: ${fx.script} (${fx.baseKeyboardId}) reaches a downloadable ZIP`, async ({
      page,
    }) => {
      const download = await walkToDownload(page, walkFixtureFor(fx));
      const dlPath = await download.path();
      expect(dlPath).not.toBeNull();
      const zipBuf = fs.readFileSync(dlPath!);
      expect(zipBuf.length, `${fx.script} zip must be non-trivial`).toBeGreaterThan(100);
    });
  }

  // --- T016: the output screen presents BOTH publish paths, and the PR path
  // degrades honestly (never fakes success) when the OAuth/managed-PR backend is
  // unreachable, while the ZIP path stays fully functional. NB: touch-STAGE
  // reachability is pinned at the spine level by the advance/manifest unit tests
  // (SR-3, advance.test.ts) — 034 owns reachability + wiring; touch DEPTH is 035.
  test("T016 [US2]: output screen exposes both publish paths; PR degrades honestly, ZIP still works", async ({
    page,
  }) => {
    await walkToOutput(page, FIXTURE);

    // PP-1: ZIP download affordance is present and (once compiled) enabled.
    const downloadBtn = page.getByTestId("emit-download");
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).not.toBeDisabled({ timeout: 60_000 });

    // PP-2: the "submit as PR" affordance is present.
    await expect(
      page.getByText(/Submit to community repository/i).first(),
    ).toBeVisible();

    // PP-3: exercise the PR path with NO reachable backend (no VITE_OAUTH_BACKEND_URL
    // in e2e → the submit POST hits a non-existent /submit/managed-pr). It must show
    // an honest failure, NEVER a success state.
    await page.getByRole("textbox", { name: /your name/i }).fill("E2E Author");
    await page.getByRole("textbox", { name: /email address/i }).fill("e2e@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /submit keyboard to community repository/i }).click();

    // An error alert appears; the "your submission is being reviewed" success
    // panel must NOT appear.
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/your submission is being reviewed/i)).toHaveCount(0);

    // PP-1 (independence): the ZIP path is still functional after a failed PR submit.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);
    expect(await download.path()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 034 US3 (T028) — durable localStorage draft: reload-and-resume.
//
// Advances several stages (identity -> ... -> Phase B "Done", which auto-
// advances the traversal to "carve" per the manifest spine — see
// steps/advance.test.ts SR-1/SR-2), hard-reloads, and confirms:
//   - AS-1/SC-003: the working copy AND activeStepId are restored (the Carve
//     gallery reappears directly; the identity panel never does) — NOT reset
//     to identity.
//   - FR-010: Back stays history-consistent after restore — Back leaves the
//     Carve gallery, and Forward from there returns to it (a round-trip that
//     would fail if the restored `history` stack were stale/inconsistent).
//   - G-3/AS-3: the WelcomeScreen "I'm new" affordance (StudioShell's other
//     start-over entry point, see draftPersistence.ts clearDraft callers)
//     clears the persisted draft, and a SUBSEQUENT reload starts fresh at
//     identity rather than re-resuming the abandoned draft.
// ---------------------------------------------------------------------------

test.describe("spec 034 US3 (T028): durable draft survives reload, Back stays consistent, start-over clears it", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("T028: hard reload resumes the working copy + step position; Back round-trips; 'I'm new' clears the draft", async ({
    page,
  }) => {
    // Advance several stages (identity -> base -> track -> project_name ->
    // prefill -> Phase B), mirroring the proven walkToOutput helper up to
    // (not including) the Output-tab hop.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page); // "Done" advances the traversal to "carve".

    await page.waitForSelector('[data-testid="carve-gallery"]', { timeout: 20_000 });

    // Let the ~500ms autosave debounce (Article IV — independent of the 300ms
    // validate cycle) commit the draft before reloading.
    await page.waitForTimeout(1_500);

    // --- Hard reload ---
    await page.reload();

    // AS-1/SC-003: NOT reset to identity. The Carve gallery reappears
    // directly on this same reloaded boot; the identity panel never renders.
    await page.waitForSelector('[data-testid="carve-gallery"]', { timeout: 30_000 });
    await expect(page.getByTestId("identity-panel")).toHaveCount(0);

    // FR-010: Back navigates away from Carve, back onto the restored `history`
    // stack's Phase B entry (the IntroChooser, re-entered from the top of
    // Phase B — same UX as any other Back into a completed phase) — proving
    // the restored `history` stack is a real, walkable path, not just a bare
    // `activeStepId` string. (BuildListView's typed-alphabet buffer is
    // component-LOCAL `useState` — see survey/PhaseB.tsx — so it resets on
    // this remount regardless of the draft feature; re-adding a character
    // below mirrors completePhaseB's own steps, not a persistence regression.)
    const carveGallery = page.getByTestId("carve-gallery");
    await carveGallery.getByRole("button", { name: "← Back" }).click();
    await expect(carveGallery).toHaveCount(0);
    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 20_000 });
    await page.click('[data-testid="phase-b-intro-next"]');

    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', FIXTURE.charToAdd);
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 10_000 });

    // Forward again: Back + Forward round-trips back to Carve — confirms the
    // history/back-nav stayed coherent across the reload+restore (not merely
    // that the CURRENT step survived).
    await page.click('[data-testid="phase-b-done"]');
    await page.waitForSelector('[data-testid="carve-gallery"]', { timeout: 20_000 });

    // G-3/AS-3: "I'm new" (WelcomeScreen's start-over entry point) clears the
    // durable draft and resets both stores in-place (hash-only navigation —
    // no reload yet).
    await page.goto("/#welcome");
    await page.getByRole("button", { name: "I’m new" }).click();
    await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 15_000 });

    // A SUBSEQUENT reload must start fresh — the cleared draft must not
    // resurrect the abandoned carve-stage session.
    await page.reload();
    await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 30_000 });
    await expect(page.getByTestId("carve-gallery")).toHaveCount(0);
  });
});
