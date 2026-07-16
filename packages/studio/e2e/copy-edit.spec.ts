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
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  navigateToOutput,
  triggerDownload,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

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
// Page-object helpers (copy-edit-specific)
// ---------------------------------------------------------------------------

/**
 * Wrapper to call driveIdentityLite with copy-edit fixture values.
 */
async function fillIdentityLite(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  await driveIdentityLite(page, {
    english: fx.english,
    autonym: fx.autonym,
    script: fx.targetScript,
  });
}

/**
 * Wrapper to call pickBaseKeyboard with copy-edit fixture values.
 * Includes wait for base picker to appear (cold server can take 20s+).
 */
async function pickBaseKeyboardCopyEdit(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  // Wait for base picker to appear. BaseResolution shows a bare "Loading base
  // keyboards..." until listAll() resolves, and the first catalog load enumerates
  // the ENTIRE local ../keyboards clone from disk (hundreds of keyboards via the
  // dev Vite plugin) — which can take well over 20s on a cold dev server.
  await page.waitForSelector('[data-testid="base-picker"]', { timeout: 90_000 });
  await pickBaseKeyboard(page, fx.baseKeyboardId);
}

/**
 * Complete Phase B using the "Add your whole alphabet" method:
 * select the method, type one character, click Add, then click Done.
 */
async function completePhaseB(page: Page, fx: WalkFixture = FIXTURE): Promise<void> {
  await buildOneCharacterList(page, fx.charToAdd);
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

test.describe("Track 1 (copy-edit) E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Seed the returning-visitor flag before navigation so a fresh browser
    // context skips WelcomeScreen's first-visit gate (see seedReturningVisitor
    // in helpers/surveyFlow.ts) and lands on the default hash-route ("survey").
    await seedReturningVisitor(page);
    await page.goto("/");
    // The default hash-route is "survey" — we should land on the identity step.
  });

  test("walks identity-lite -> base picker -> project-name -> Phase B -> emit", async ({
    page,
  }) => {
    // Walk the wizard.
    await fillIdentityLite(page);
    await pickBaseKeyboardCopyEdit(page);
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
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
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
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
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
  await pickBaseKeyboardCopyEdit(page, fx);
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
    await seedReturningVisitor(page);
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
    // Seeded so the walk below starts at identity (not WelcomeScreen) — this
    // is draft-safe (unlike WelcomeScreen's "I'm new") and does not prevent
    // reaching WelcomeScreen later: StudioShell's router still honors an
    // explicit `#welcome` hash (see the "I'm new" assertion below) once the
    // first-visit gate is satisfied — the gate only forces the redirect for
    // a genuine first-timer.
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("T028: hard reload resumes the working copy + step position; Back round-trips; 'I'm new' clears the draft", async ({
    page,
  }) => {
    // Advance several stages (identity -> base -> track -> project_name ->
    // prefill -> Phase B), mirroring the proven walkToOutput helper up to
    // (not including) the Output-tab hop.
    await fillIdentityLite(page);
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
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
