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
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { OUTPUT_SCREEN_DEBT } from "./helpers/contrastDebt";
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
  driveConvenienceStep,
  driveMarksSeries,
  driveMechanismsGallery,
  navigateToOutput,
  triggerDownload,
  seedReturningVisitor,
  switchTab,
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
//   Cyrillic  — basic_kbdru          (ru, Cyrl)  — Windows "Russian Basic"
//   Greek     — basic_kbdhe          (el, Grek)  — Windows Greek "Hellenic" basic
//   Georgian  — basic_kbdgeo         (ka, Geor)
//   Armenian  — basic_kbdarme        (hy, Armn)  — Windows "Armenian Eastern Basic"
//
// NB: `basic_kbdgr` is GERMAN (Windows "GR" = German), NOT Greek — do not use it.
//
// #1439: russian_mnemonic_r/armenian_mnemonic_r previously covered Cyrl/Armn
// here — both are mnemonic keyboards (phonetic QWERTY remap by design/name,
// not the &MNEMONICLAYOUT store flag, so no lint can catch this; see the
// issue's precision note), a style this project doesn't support. Worse, they
// were the suite's most reliable passes while both `basic_*` rows (the styles
// this project DOES support) timed out, so the matrix's green signal was
// carried substantially by keyboards we don't support. Swapped for
// basic_kbdru/basic_kbdarme (both codec-clean: verified via a direct parse()
// call — 0 opaque fragments/features, ~164/173 rules each).
//
// A sixth, bonus Latn row is added below for Cameroon AZERTY
// (sil_cameroon_azerty) — a real SIL production keyboard (278 BCP47
// languages), squarely the kind of keyboard this tool targets, unlike the
// synthetic basic_kbdfr walk. It also exercises touch-derivation (it ships a
// .keyman-touch-layout) and gives specs/051-carve-orthography-trim an
// end-to-end walk: `ɨ` is that spec's own worked example of the `ɨ`/`i`
// surplus interaction, and is in this keyboard's .kmn for `agq` (Aghem), one
// of its declared languages.
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
  { script: "Latn", baseKeyboardId: "basic_kbdfr",         languageCode: "fr",  targetScript: "Latn", charToAdd: "é" },
  { script: "Cyrl", baseKeyboardId: "basic_kbdru",         languageCode: "ru",  targetScript: "Cyrl", charToAdd: "я" },
  { script: "Grek", baseKeyboardId: "basic_kbdhe",         languageCode: "el",  targetScript: "Grek", charToAdd: "ω" },
  { script: "Geor", baseKeyboardId: "basic_kbdgeo",        languageCode: "ka",  targetScript: "Geor", charToAdd: "ქ" },
  { script: "Armn", baseKeyboardId: "basic_kbdarme",       languageCode: "hy",  targetScript: "Armn", charToAdd: "ա" },
  // Bonus row (#1439) — see the header comment above for why this is here
  // alongside, not instead of, basic_kbdfr's Latn row.
  { script: "Latn", baseKeyboardId: "sil_cameroon_azerty", languageCode: "agq", targetScript: "Latn", charToAdd: "ɨ" },
];

/**
 * Pre-existing 1.4.3 (Contrast Minimum) offender on the screen this scan
 * actually lands on (per the manifest spine, legitimately the Carve gallery
 * — see the retained history in git blame if the "phase B complete" label
 * seems mismatched). #1477's ground-truth sweep (live axe run with this list
 * emptied) found every OTHER entry it used to carry — ConvenienceCharsStep's
 * Continue, CarveGallery v1's info-panel toggle (dead code; CarveGalleryV2 is
 * unconditional), carve-continue, RemovalBanner's dismiss control, Rail's/
 * GlyphCell's v1-only surfaces — already clean. Only the OSK iframe remains.
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [
  // 1.4.3 — the OSK iframe renders KeymanWeb's own markup
  // (.kmw-spacebar-caption), which this repo does not author and cannot
  // restyle from here.
  "iframe",
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

/**
 * Drive Carve + Mechanisms to completion so the Output nav gate
 * (useInventoryCoverageGate) is satisfied before navigateToOutput is called.
 *
 * Every fixture in this file adds a character the base ALREADY produces (é on
 * basic_kbdfr, я on russian_mnemonic_r, etc.) — before the spec 046 marks
 * series existed, that made lettersToAdd empty and the Output nav link
 * unconditionally reachable straight off Phase B. It no longer is: an
 * accepted marks-series proposal for a decomposable charToAdd promotes its
 * combining mark into the same worklist as a genuinely new character (it is
 * NOT already produced, even though the precomposed letter is), so the
 * Mechanisms gallery can still owe real work here. Skipped cleanly for a base
 * with no combining-mark promotion at all (e.g. the Georgian fixture) via
 * driveMechanismsGallery's own empty-diff branch. See
 * specs/057-bulletproof-navigation/reviews/classB-diagnosis.md.
 */
async function finishGalleryWork(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await driveMechanismsGallery(page);
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

    // Accessibility gate (spec 056 FR-003): scan the completed Phase B screen.
    await expectNoSeriousAxeViolations(page, "phase B complete (copy-edit walk)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    await finishGalleryWork(page);

    // Navigate to Output tab and trigger the download.
    await navigateToOutput(page);

    // Accessibility gate (spec 056 FR-003): scan the output screen.
    // 1.4.3 — the Output screen's documented pre-existing contrast debt
    // (OskModeToggle, SignUpPanel, OSK iframe); see helpers/contrastDebt.ts.
    await expectNoSeriousAxeViolations(page, "output screen (copy-edit walk)", {
      exclude: OUTPUT_SCREEN_DEBT,
    });
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
    await finishGalleryWork(page);
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
    // "Download source .zip" (not "Download .zip") since the .kmp package
    // became the primary download; see output.download.button.download.
    await expect(downloadBtn).toHaveText("Download source .zip");
  });

  test("emitted .kps declares the author's language and name; .kvks and welcome.htm are non-empty", async ({
    page,
  }) => {
    // Walk the wizard and download. Unlike the other walks here this one supplies
    // the language code, so the identity-lite series composes a real BCP47 tag for
    // the package descriptor to declare (spec 059 FR-001) instead of leaving the
    // field blank and falling back to the `und` placeholder.
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
      languageCode: FIXTURE.languageCode,
    });
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
    await chooseTrackCopy(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await completePhaseB(page);
    await finishGalleryWork(page);
    await navigateToOutput(page);
    const download = await triggerDownload(page);

    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const zipBuf = fs.readFileSync(dlPath!);
    // unzipSync fully decompresses each entry into a Uint8Array; we assert on
    // the decompressed body length so "non-empty" reflects real content.
    const entries = Object.entries(unzipSync(new Uint8Array(zipBuf)));

    // The .kps must not merely EXIST — it must declare the author's language and
    // name (US1-1, SC-002). Presence alone is what the pre-057 assertion checked,
    // and a descriptor declaring the French base's `fr` passed it.
    const kps = entries.find(([name]) => name.endsWith(".kps"));
    expect(kps, "zip must contain a .kps package file").toBeDefined();
    expect(kps![1].length, ".kps must be non-empty").toBeGreaterThan(0);

    const kpsText = new TextDecoder().decode(kps![1]);
    // The author's composed tag: language code + target script, taken whole from
    // the identity-lite result. EXACTLY ONE <Language>, so a base tag cannot be
    // sitting alongside it.
    const languageElements = kpsText.match(/<Language\b[^>]*>[^<]*<\/Language>/g) ?? [];
    expect(
      languageElements,
      ".kps must declare exactly one language: the author's composed tag, with their language's English name as its display text",
    ).toEqual([
      `<Language ID="${FIXTURE.languageCode}-${FIXTURE.targetScript}">${FIXTURE.english}</Language>`,
    ]);
    // SC-002 stated directly: the base keyboard's own language declaration is gone.
    expect(kpsText, ".kps must not declare the base keyboard's language").not.toContain(
      '<Language ID="fr">fr</Language>',
    );
    // FR-003: the author's display name reaches <Info><Name> and the keyboard's own
    // <Name>. acceptProjectName commits the seeded name, which is the autonym.
    expect(kpsText).toContain(`<Name URL="">${FIXTURE.autonym}</Name>`);

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

  // Spec 057 FR-072: a mid-walk tab round trip, folded into an existing long
  // walk so position survival is proven incidentally rather than only by the
  // dedicated gating spec. Before the D-1 fix this single pair of clicks was
  // enough to throw the whole walk back to the identity question — every
  // assertion below it would have failed.
  await switchTab(page, "preview");
  await switchTab(page, "survey");
  await completePhaseB(page, fx);
  await finishGalleryWork(page);
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
  test("T010 [US1]: Cyrillic (basic_kbdru) walks identity → downloadable, compilable ZIP", async ({
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

  // --- T011: all five proven scripts (FR-011, SC-004), plus a bonus Cameroon
  // AZERTY Latn case (#1439), reach a downloadable ZIP.
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
//   - G-3/AS-3: the WelcomeScreen "Continue as guest" affordance (StudioShell's other
//     start-over entry point, see draftPersistence.ts clearDraft callers)
//     clears the persisted draft, and a SUBSEQUENT reload starts fresh at
//     identity rather than re-resuming the abandoned draft.
// ---------------------------------------------------------------------------

test.describe("spec 034 US3 (T028): durable draft survives reload, Back stays consistent, start-over clears it", () => {
  test.beforeEach(async ({ page }) => {
    // Seeded so the walk below starts at identity (not WelcomeScreen) — this
    // is draft-safe (unlike WelcomeScreen's "Continue as guest") and does not prevent
    // reaching WelcomeScreen later: StudioShell's router still honors an
    // explicit `#welcome` hash (see the "Continue as guest" assertion below) once the
    // first-visit gate is satisfied — the gate only forces the redirect for
    // a genuine first-timer.
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("T028: hard reload resumes the working copy + step position; Back round-trips; 'Continue as guest' clears the draft", async ({
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
    // stack's Phase B entry — proving the restored `history` stack is a real,
    // walkable path, not just a bare `activeStepId` string.
    //
    // Reaches Phase B's BUILD-LIST screen directly, NOT the IntroChooser
    // (via the convenience entry Back lands on first — see below). This is
    // pre-existing store architecture, not a spec 057 or finishGalleryWork
    // interaction: `discoveryMethod` (stores/surveySessionStore.ts) is an
    // explicit field of `TraversalSnapshot` (see `snapshotTraversal` /
    // `applyTraversalSnapshot`, surveySessionStore.ts ~657-741) — durable by
    // design, restored verbatim across BOTH a hard reload and any manifest
    // Back (`performManifestBack` -> `popHistory()` only; nothing resets
    // `discoveryMethod`). PhaseB.tsx's own render branch
    // (`if (discoveryMethod === null) return <IntroChooser .../>`, ~line 1299)
    // renders BuildListView directly once a discovery method has EVER been
    // chosen this draft — which happened on the very first pass through Phase
    // B, above. `phaseBDraftStore`'s `chars` are equally durable across this
    // same remount (`reset()` only fires on the prefill->B substage
    // transition — stores/phaseBDraftStore.ts ~22-23 — not on a later Back
    // into an already-visited "characters" step), so the alphabet still shows
    // FIXTURE.charToAdd from the first pass; re-adding it below is a no-op
    // dedup, not a fresh addition, but still exercises the same UI path.
    // (spec 057 US5's viewStateStore, stores/viewStateStore.ts, carries no
    // Phase-B-substage field at all — flowMapSection/paneSplitPct/oskMode/
    // scrollTop/compareSelection/trail state only — so it is not the
    // mechanism here.)
    const carveGallery = page.getByTestId("carve-gallery");
    await carveGallery.getByRole("button", { name: "← Back" }).click();
    await expect(carveGallery).toHaveCount(0);

    // Back walks the restored history stack one entry at a time, and the
    // entry BEFORE carve is not Phase B itself: the forward walk above
    // answered the conditional convenience question (basic_kbdfr leaves ~25
    // spare base letters for this fixture), so that step sits between the
    // two on the stack. Land there first, then one more Back reaches the
    // Phase B entry — still proving the same FR-010 claim (the restored
    // history is a real, walkable path).
    await expect(
      page.getByRole("heading", { name: /Keep these letters for convenience/i }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Back", exact: true }).click();

    // ...and the entry before convenience is not Phase B either: the marks
    // series (`fc2ee650`, spec 046/052) inserted a step between `characters`
    // and `convenience`, so the locked spine is
    // `characters -> marks -> convenience -> carve`. FIXTURE.charToAdd ("é")
    // is decomposable-accented, so the marks step genuinely renders on the
    // forward walk (this same test drives it via `driveMarksSeries` below) and
    // is therefore on the restored history stack that Back is walking. Landing
    // here is the same Class-B driver drift catalogued in
    // specs/057-bulletproof-navigation/reviews/classB-diagnosis.md — a driver
    // that still assumed the pre-marks spine — at a call site that diagnosis
    // did not reach, not a spec 057 regression: the walk arrives on
    // "Accents & marks" exactly as the spine says it should.
    await expect(page.getByRole("heading", { name: /Accents & marks/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Back", exact: true }).click();

    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 20_000 });
    await page.fill('[aria-label="Character to add"]', FIXTURE.charToAdd);
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 10_000 });

    // Forward again: Back + Forward round-trips back to Carve — confirms the
    // history/back-nav stayed coherent across the reload+restore (not merely
    // that the CURRENT step survived).
    await page.click('[data-testid="phase-b-done"]');
    // The forward path re-traverses the same conditional steps Back walked
    // through; the shared drivers no-op cleanly when a step is skipped.
    await driveMarksSeries(page);
    await driveConvenienceStep(page);
    await page.waitForSelector('[data-testid="carve-gallery"]', { timeout: 20_000 });

    // G-3/AS-3: "Continue as guest" (WelcomeScreen's start-over entry point)
    // clears the durable draft and resets both stores in-place (hash-only
    // navigation — no reload yet).
    await page.goto("/#welcome");
    await page.getByRole("button", { name: "Continue as guest" }).click();
    await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 15_000 });

    // A SUBSEQUENT reload must start fresh — the cleared draft must not
    // resurrect the abandoned carve-stage session.
    await page.reload();
    await page.waitForSelector('[data-testid="identity-panel"]', { timeout: 30_000 });
    await expect(page.getByTestId("carve-gallery")).toHaveCount(0);
  });
});
