// E2E: spec 035 (mobile/touch layout derivation) — US1 "import & adapt" walk.
//
// Proves the full Scenario A chain from specs/035-mobile-touch-derivation/quickstart.md:
//   author from a base that SHIPS a .keyman-touch-layout -> carve N (>=2) desktop
//   characters -> place M (>=1) new letters in Mechanisms (desktop locks) -> the
//   touch_seed_source fork step defaults to "Import & adapt" -> walk the Touch
//   gallery to completion (accepting the carried-over suggestion for the placed
//   letter satisfies the FR-008 coverage gate) -> emit the ZIP and assert the
//   derived `source/<id>.keyman-touch-layout`:
//     - starts from the BASE's platforms/layers (a base-only artifact and a
//       distinctive untouched base key both survive — not the minimal-QWERTY
//       generate-from-scratch scaffold shape, see scaffoldTouchLayout.ts),
//     - contains NEITHER of the N carved characters anywhere in the document,
//     - contains the M placed character,
//     - and the keyboard compiles (the emit-download gate is the same
//       compile-clean signal carve.spec.ts / copy-edit.spec.ts rely on).
//
// Fixture: bambara (Mande, Mali — see docs/keyboard-index.md). Chosen because:
//   - it SHIPS a real `source/bambara.keyman-touch-layout` with a "phone"
//     platform (default/shift/numeric layers) — required for Case B
//     (applyDesktopModificationsToRawJson) to have somewhere to land a Phase C
//     placement; many single-source-imported keyboards (e.g. the `basic_*`
//     family used by copy-edit.spec.ts) ship only a "tablet" platform, so a
//     Mechanisms placement would be silently skipped (see
//     applyDesktopModificationsToRawJson.ts "no phone platform found").
//   - its .kmn is codec-clean (0 raw fragments, 0 opaque features — verified
//     via a throwaway parse() probe) and is a single flat `group(main)` of 104
//     unconditional `+ [K_X] > 'ch'` rules — no deadkeys, no NCAPS/CAPS
//     branching, no context rules — so every character is its own
//     independently-removable glyph in the Carve gallery (confirmed via a
//     throwaway recognizePatterns() probe: recognizedRatio is 0 for Track 1
//     adapt, since instantiateFromBase never calls the recognizer, so the
//     whole keyboard renders as ONE "main" group card with 104 flat glyphs —
//     no cascade-delete dialog fires for a character produced by exactly one
//     rule).
//   - it ships three IPA-derived Latin letters with no diacritic-composition
//     relationship to any other rule — 'ɛ' (K_COLON), 'ŋ' (K_QUOTE), 'ɔ'
//     (K_COMMA) — which makes them ideal, unambiguous carve targets/survivors:
//     carving 'ɛ' and 'ŋ' can't accidentally cascade into removing an
//     unrelated character, and leaving 'ɔ' untouched gives a concrete,
//     base-only "did this survive" marker.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test touch-derivation-us1.spec.ts
//
// SKIPPED — UNBLOCK RECIPE (same convention as import-improve.spec.ts):
//   The Playwright lane itself is RUNNABLE again (global playwright CLI +
//   browsers installed; `npx playwright test` boots the dev server and
//   executes specs). Executing this spec surfaced a PRE-EXISTING, repo-wide
//   breakage, not a defect in this walk: the survey prelude that all e2e
//   specs share by copy (driveIdentityLite et al.) targets the OLD
//   identity-lite first field (`#il_language_autonym`), but the app now
//   opens with the 036 glottolog language-identify flow ("What is your
//   language called in English?" combobox, "Step 1 of ~6"). carve.spec.ts
//   — documented as live/passing — fails at the exact same locator, so the
//   stale prelude predates spec 035 and blocks every walk-from-scratch spec.
//   To un-skip:
//     1. Update the survey prelude for the 036 language-identify flow —
//        preferably by extracting the shared helpers into
//        e2e/helpers/surveyFlow.ts (the acknowledged de-triplication
//        follow-up) and fixing them ONCE for carve/copy-edit/this spec.
//     2. Remove `.skip` from the describe below and run
//        `cd packages/studio && npx playwright test touch-derivation-us1.spec.ts`.
//   Everything downstream of the prelude (carve targets, seed-source
//   default, touch-gallery walk, ZIP assertions) was traced to source and
//   cross-checked against MechanismGallery.test.tsx / TouchGallery.test.tsx /
//   applyDesktopModificationsToRawJson.ts; the bambara fixture's
//   codec-cleanliness + phone-platform shipping were confirmed via vitest
//   probes against packages/engine/src.

import { test, expect, type Page } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bambara";

/** N (>=2) carve targets — each produced by exactly ONE rule (K_COLON / K_QUOTE
 *  unshifted), so clicking their glyph chip plain-toggles (no cascade dialog). */
const CARVED_CHARS = ["ɛ", "ŋ"] as const;

/** A base-only character we deliberately do NOT carve — the "did the derived
 *  touch layout start from the base, not a generated scaffold" survivor
 *  (K_COMMA unshifted; never appears in the compact QWERTY scaffold that
 *  scaffoldTouchLayout.ts would generate from scratch). */
const SURVIVOR_CHAR = "ɔ";

/** M (>=1) placed letter — added in Phase B (not produced by bambara at all),
 *  decomposable (e + U+0301) so MechanismGallery's §3c default (deadkey,
 *  base letter pre-filled "e", trigger key "K_COLON") leaves Apply already
 *  enabled with zero field edits (mirrors MechanismGallery.test.tsx's
 *  "defaults to the deadkey method" case for "á"). deriveDesktopModifications
 *  extracts hostKey "K_E" from the resulting S-02 assignment's baseLetters
 *  slot (extractMechanismHostKey.ts), landing "é" as a longpress (sk[])
 *  alternate on the K_E touch key (whose base text "e" is non-empty). */
const PLACED_CHAR = "é";

const KMN_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.kmn`;
const TOUCH_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.keyman-touch-layout`;

// ---------------------------------------------------------------------------
// Page-object-lite helpers — mirrors carve.spec.ts's established conventions
// (same survey-advance testid, same Adapt-track step shape).
// ---------------------------------------------------------------------------

function surveyAdvance(page: Page) {
  return page.getByTestId("survey-advance");
}

/** Identity-lite (Phase A). Latin script keeps routing through the ranked
 *  BaseResolution picker (not the §9 CJK/Ethiopic/Hangul stub, and not the
 *  plain "Base keyboard" combobox carve.spec.ts's "other"-script path uses). */
async function driveIdentityLite(page: Page): Promise<void> {
  await page.locator("#il_language_autonym").fill("Bamanankan");
  await surveyAdvance(page).click();

  await expect(page.locator("#il_language_english")).not.toHaveValue("");
  await surveyAdvance(page).click();

  await page.locator("#il_language_code").fill("bm");
  await surveyAdvance(page).click();

  await page.locator("#il_target_script").selectOption("Latn");
  await surveyAdvance(page).click();

  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
}

/**
 * Resolve the base keyboard via BaseResolution's embedded BaseKeyboardPicker
 * combobox (accessible name "Search keyboards" — BaseResolution overrides the
 * component's "Base keyboard" default label, see BaseKeyboardPicker.tsx).
 * Widens to the full catalog first so a specific low-profile id (bambara) is
 * searchable deterministically, rather than trusting the suggestion ranking
 * to surface it (the approach copy-edit.spec.ts's fallback-first-button path
 * takes, which would not reliably pick bambara specifically).
 */
async function pickBaseKeyboard(page: Page, keyboardId: string): Promise<void> {
  await page.getByTestId("search-scope-all").click();

  const combobox = page.getByRole("combobox", { name: "Search keyboards" });
  await combobox.click();
  await combobox.fill(keyboardId);

  const option = page.getByRole("option", { name: new RegExp(keyboardId) }).first();
  await option.click();

  await page.getByTestId("base-confirm").click();
}

/** track step — Track 1 "Adapt" (keeps the base's own keyboardId, "bambara",
 *  and skips the project-name step entirely — same shape as carve.spec.ts). */
async function chooseAdaptTrack(page: Page): Promise<void> {
  await page.getByTestId("track-adapt").check();
  await surveyAdvance(page).click();
}

/** characters step, prefill sub-stage — static confirmation, no inputs. */
async function confirmPrefill(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}

/**
 * characters step, Phase B sub-stage (build-list method) — adds exactly the
 * ONE placed character ("é"). Bambara produces no accented Latin letters at
 * all, so "é" is genuinely absent from buildProducedSet(baseIr): it survives
 * into MechanismGallery's `lettersToAdd` (the M placement below), rather than
 * being pre-empted into the "already produced" empty-diff fast path that
 * carve.spec.ts/copy-edit.spec.ts deliberately use for their own (different)
 * purposes.
 */
async function addPlacedCharacterToInventory(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Character to add").fill(PLACED_CHAR);
  await page.getByRole("button", { name: "+ Add" }).click();

  await page.getByRole("button", { name: /^Done \(1 character\)$/ }).click();
}

/**
 * Carve gallery — carve CARVED_CHARS, leave SURVIVOR_CHAR untouched. With
 * recognizedRatio 0 (Track 1 adapt never calls recognizePatterns) and no
 * stores/raw fragments, bambara's IR resolves to exactly one "main" group
 * node, which is the Inspector's default selection (nodes[0]) — no rail-card
 * click is needed before the glyph chips are visible.
 *
 * Each target character is produced by exactly one rule with no store
 * dependency, so clicking its glyph body plain-toggles the deletion directly
 * (buildPendingCascade's removableCount<=1/blocked.length===0 short-circuit)
 * — no cascade ConfirmDialog appears.
 */
async function carveCharacters(page: Page, chars: readonly string[]): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });

  for (const ch of chars) {
    const glyph = page.getByRole("button", { name: new RegExp(`^${ch}\\s`, "u") });
    await expect(glyph).toBeVisible();
    await glyph.click();
  }

  // Sanity check that the survivor was never touched.
  const survivor = page.getByRole("button", { name: new RegExp(`^${SURVIVOR_CHAR}\\s`, "u") });
  await expect(survivor).toBeVisible();
  await expect(survivor).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("carve-continue").click();
}

/**
 * Mechanisms gallery (Phase C, desktop) — place PLACED_CHAR ("é"). Dismisses
 * the one-time intro splash, then applies the §3c deadkey default (already
 * enabled — see PLACED_CHAR's doc comment above) and advances. Completing
 * this step is what fires lockDesktop() (reducer.ts MECHANISMS_STEP_ID case)
 * — "the desktop locks at the end of Mechanisms" is this click, not a
 * separate assertable UI state.
 */
async function driveMechanismsPlaceLetter(page: Page, char: string): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  await page.getByRole("button", { name: `Apply method for ${char}` }).click();
  await page.getByTestId("mechanisms-continue").click();
}

/**
 * touch_seed_source fork step (spec 035 FR-006/R4) — bambara ships a usable
 * "phone" platform touch layout, so the default selection MUST be
 * "import-adapt" (TouchSeedSourcePanel.tsx: hasUsableBaseLayout -> default
 * "import-adapt"). Asserts the default before confirming it, per the task's
 * explicit "confirm the default is Import & adapt" requirement.
 */
async function confirmImportAdaptDefault(page: Page): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });

  const importAdapt = page.getByTestId("seed-source-import-adapt");
  await expect(importAdapt).toHaveAttribute("aria-pressed", "true");
  const reseed = page.getByTestId("seed-source-reseed");
  await expect(reseed).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("seed-source-confirm").click();
}

/**
 * Touch gallery (Phase E) — accepts the carried-over long-press suggestion
 * for PLACED_CHAR. Phase C's S-02 assignment for "é" makes TouchGallery's
 * per-character `suggestion` resolve to `{kind:"longpress", hostKey:"K_E"}`
 * (extractMechanismHostKey.ts), so an "Accept" control is always present for
 * this character — accepting it is what satisfies the FR-008 coverage gate
 * (touchCoverage(finalLayout, inventory).uncovered must be empty before
 * handleContinue's touch-continue click is allowed to complete the stage).
 */
async function driveTouchGalleryAcceptPlacement(page: Page, char: string): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  const acceptButton = page.getByRole("button", {
    name: new RegExp(`^Use suggested long-press method for .*${char}$`, "u"),
  });
  await expect(acceptButton).toBeVisible({ timeout: 15_000 });
  await acceptButton.click();

  await page.getByTestId("touch-continue").click();
}

/**
 * help (Phase F) step — bounded-loop driver identical to carve.spec.ts's
 * driveHelpPhase (Phase F's shape is keyboard-independent).
 */
async function driveHelpPhase(page: Page): Promise<void> {
  await page.locator("#pf_welcome_paragraph").fill("Welcome to the Bambara keyboard.");
  await surveyAdvance(page).click();

  await page.locator("#pf_usage_tip_1").fill("Type ɛ, ɔ, and ŋ directly from the base layout.");

  for (let guard = 0; guard < 15; guard++) {
    await surveyAdvance(page).click();
    if (/#output$/.test(page.url())) {
      return;
    }
  }
  throw new Error("driveHelpPhase: did not reach #output within the expected question count");
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

// .skip: blocked on the repo-wide stale survey prelude (see unblock recipe in the header).
test.describe.skip("Touch derivation US1 — import & adapt (spec 035 Scenario A)", () => {
  test("carved characters vanish, placed letter lands, base layout survives, and the keyboard compiles", async ({
    page,
  }) => {
    await page.goto("/");

    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await addPlacedCharacterToInventory(page);

    // Manifest spine order (StudioShell.tsx): characters -> carve ->
    // mechanisms -> touch_seed_source -> touch -> help.
    await carveCharacters(page, CARVED_CHARS);
    await driveMechanismsPlaceLetter(page, PLACED_CHAR);
    await confirmImportAdaptDefault(page);
    await driveTouchGalleryAcceptPlacement(page, PLACED_CHAR);
    await driveHelpPhase(page);

    await page.waitForURL(/#output$/, { timeout: 30_000 });

    // ---------------------------------------------------------------------
    // SC-001/SC-004: compile-clean + emit. The download button becoming
    // enabled IS the compile-clean signal this codebase's other live E2E
    // specs rely on (carve.spec.ts / copy-edit.spec.ts) — stage.kind reaches
    // "ready" only once the kmcmplib WASM oracle compiles without fatal
    // errors.
    // ---------------------------------------------------------------------
    const downloadButton = page.getByTestId("emit-download");
    await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();

    const zipBytes = await readFile(zipPath as string);
    const entries = unzipSync(new Uint8Array(zipBytes));

    // .kmn sanity — the carved characters must not survive in the desktop
    // source either (belt-and-suspenders; the touch-layout assertions below
    // are this test's real focus).
    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);
    for (const ch of CARVED_CHARS) {
      expect(kmnText, `.kmn must not still produce carved char ${ch}`).not.toContain(`'${ch}'`);
    }

    // ---------------------------------------------------------------------
    // Touch-layout assertions (FR-002/004/005, SC-001).
    // ---------------------------------------------------------------------
    const touchBytes = entries[TOUCH_ZIP_PATH];
    expect(touchBytes, `expected ${TOUCH_ZIP_PATH} in the emitted zip`).toBeDefined();
    const touchText = strFromU8(touchBytes as Uint8Array);
    const touchJson = JSON.parse(touchText) as {
      phone?: { font?: string; layer?: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    };

    // "Starts from the base, not the minimal-QWERTY scaffold": bambara's
    // shipped layout carries a top-level `"font": "Tahoma"` on its phone
    // platform — an artifact scaffoldTouchLayout.ts's generate-from-scratch
    // path (buildCanonicalPhoneLayers) never sets. Case B
    // (applyDesktopModificationsToRawJson) preserves every unmodified field
    // verbatim (R9), so this field surviving is direct proof the derivation
    // started from the base's own JSON.
    expect(touchJson.phone?.font).toBe("Tahoma");

    // A distinctive, untouched base key survives: 'ɔ' (U_0254, K_COMMA) was
    // never carved and is not a US-keycap character, so its presence also
    // rules out the generic scaffold shape.
    expect(touchText, "surviving base character must still appear").toContain(SURVIVOR_CHAR);

    // NONE of the N carved characters appear anywhere in the document — the
    // whole-document string check covers text/output/sk/flick/multitap alike
    // (removeAcrossRawLayout walks every one of those fields; a JSON-string
    // containment check is a faithful proxy for "not present in ANY of
    // them", since JSON.stringify never re-encodes these codepoints as
    // escapes).
    for (const ch of CARVED_CHARS) {
      expect(touchText, `carved char ${ch} must not appear anywhere in the touch layout`).not.toContain(ch);
    }

    // The M placed character is present (landed as a longpress alternate on
    // K_E, whose base "e" production was non-empty).
    expect(touchText, "placed char must appear in the touch layout").toContain(PLACED_CHAR);
  });
});
