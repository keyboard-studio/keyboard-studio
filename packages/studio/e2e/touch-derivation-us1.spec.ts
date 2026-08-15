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
// This spec drives the survey prelude via the shared helpers in
// e2e/helpers/surveyFlow.ts (updated for the 036 glottolog language-identify
// flow). Everything downstream of the prelude (carve targets, seed-source
// default, touch-gallery walk, ZIP assertions) was traced to source and
// cross-checked against MechanismGallery.test.tsx / TouchGallery.test.tsx /
// applyDesktopModificationsToRawJson.ts; the bambara fixture's
// codec-cleanliness + phone-platform shipping were confirmed via vitest
// probes against packages/engine/src.

import { test, expect, type Page } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import {
  GLYPH_KEY_CHIP_DEBT,
  OSK_IFRAME_DEBT,
  OUTPUT_SCREEN_DEBT,
  SHARED_CHROME_DEBT,
} from "./helpers/contrastDebt";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import {
  driveIdentityLite as driveIdentityLiteBase,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  driveMechanismsGallery,
  driveTouchGallery,
  driveHelpPhase,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";

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

/**
 * Pre-existing 1.4.3 (Contrast Minimum) offenders on the Phase B build-list
 * screen, excluded by selector with the criterion and reason named inline —
 * the same idiom e2e/tab-roundtrip.spec.ts and e2e/decision-deeplink.spec.ts
 * use (KNOWN_CONTRAST_DEBT). This is spec 056's open tracker debt
 * (specs/056-ada-accessibility/wcag-2.2-aa-tracker.md, 1.4.3 is an open
 * `unknown` row), not anything introduced or touched by spec 057 —
 * CarveGallery.tsx and Rail.tsx are byte-identical to `main` (see
 * specs/057-bulletproof-navigation/evidence/gating-red.md §"Two corrections
 * made to reach a *valid* red"). Same offenders as carve.spec.ts's own
 * KNOWN_CONTRAST_DEBT (this screen renders the same carve-card affordance
 * mid Phase B, before the standalone carve gallery step).
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [
  // 1.4.3 — CarveGallery's info-panel toggle button.
  'button[aria-label="Hide info panel"]',
  // 1.4.3 — CarveGallery's footer "Continue" button.
  'button[data-testid="carve-continue"]',
  // 1.4.3 — Rail's per-node carve-card buttons: the "kept/total" and
  // per-modifier breakdown spans inside them (Rail.tsx) fall short.
  // Excluded by the testid PREFIX (carve-card-<nodeId> varies per fixture,
  // e.g. "carve-card-group#0") rather than the brittle nth-child span chain
  // axe reports for the same reason.
  'button[data-testid^="carve-card-"]',
  // 1.4.3 — GlyphCell's cross-reference tag chips (assignLoop/parts/
  // GlyphCell.tsx): "<kind> — go to" / "<kind> — N places". Keyed on the
  // aria-label SUFFIX because the kind prefix varies ("store", "group", ...)
  // and the chips carry no testid.
  'button[aria-label$="go to"]',
  'button[aria-label$="places"]',
  // 1.4.3 — Rail's sticky SectionHeader (assignLoop/parts/Rail.tsx): the
  // tone-colored uppercase section label. The header is an anonymous div
  // with no testid/aria hook, so it is keyed on its one distinguishing
  // attribute — the inline-style signature only this header uses. Adding a
  // programmatic landmark to Rail is 056's call, not this spec's.
  'div[style*="letter-spacing: 0.13em"]',
  // 1.4.3 — ConvenienceCharsStep's "Continue" button; the same debt
  // copy-edit.spec.ts and touch-derivation-us2.spec.ts already exclude.
  // Which subset of this screen's debt axe reports varies with load timing
  // (the scan fires on whatever has rendered), so the list carries every
  // known offender for the screen even when one run flags only some.
  'button[data-testid="convenience-continue"]',
  // 1.4.3 — RemovalBanner's "Dismiss" button (assignLoop/parts/
  // RemovalBanner.tsx): `var(--app-text-subtle)` on the banner's
  // `--sil-green`-tinted background falls short of 4.5:1.
  //
  // This offender only became reachable here once the mid-walk tab round trip
  // above stopped discarding the working copy. The banner renders on
  // `recommended.length > 0`, which is derived from working-copy state that
  // the pre-fix restoring-boot/remount path was clearing: measured directly,
  // `phaseResults` went 2 -> 0 across `switchTab(preview) -> switchTab(survey)`
  // on the adapt track before the fix, and 2 -> 2 after it. So the banner's
  // absence was the defect and its presence is the corrected behaviour — the
  // scan is seeing more of the screen, not a new violation. RemovalBanner.tsx
  // is byte-identical to `main` (`git diff main...HEAD` is empty for it), and
  // this is the same open 1.4.3 `unknown` tracker row as every entry above.
  // See specs/057-bulletproof-navigation/reviews/F2-reload-phaseresults-loss.md.
  'button[aria-label="Dismiss removal recommendation"]',
  // The OSK iframe's `.kmw-spacebar-caption` contrast debt is now fixed at
  // the source (packages/studio/public/osk-frame.html overrides its color);
  // the whole-iframe exclusion is gone, so this scan now covers everything
  // the frame renders.
];

// ---------------------------------------------------------------------------
// Page-object helpers (touch-derivation-specific)
// ---------------------------------------------------------------------------

/**
 * Identity-lite for touch-derivation (spec 036 language-identify flow).
 * Latin script keeps routing through the ranked BaseResolution picker
 * (not the §9 CJK/Ethiopic/Hangul stub).
 */
async function driveIdentityLite(page: Page): Promise<void> {
  await driveIdentityLiteBase(page, {
    english: "Test",
    autonym: "Bamanankan",
    script: "Latn",
  });
  // Additional wait for BaseResolution to render its picker (spec 035 may take longer)
  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
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
  await buildOneCharacterList(page, PLACED_CHAR);
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

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Touch derivation US1 — import & adapt (spec 035 Scenario A)", () => {
  test("carved characters vanish, placed letter lands, base layout survives, and the keyboard compiles", async ({
    page,
  }) => {
    // Seed the returning-visitor flag before navigation so this fresh
    // browser context skips WelcomeScreen's first-visit gate.
    await seedReturningVisitor(page);
    await page.goto("/");

    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);

    // Spec 057 FR-072: a mid-walk tab round trip, folded into an existing long
    // walk so position survival is proven incidentally rather than only by the
    // dedicated gating spec. Before the D-1 fix this single pair of clicks was
    // enough to throw the whole walk back to the identity question — every
    // assertion below it would have failed.
    await switchTab(page, "preview");
    await switchTab(page, "survey");
    await addPlacedCharacterToInventory(page);

    // Accessibility gate (spec 056 FR-003): scan the Phase B build-list screen.
    await expectNoSeriousAxeViolations(page, "phase B build list (US1 bambara walk)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // Manifest spine order (StudioShell.tsx): characters -> carve ->
    // mechanisms -> touch_seed_source -> touch -> help.
    await carveCharacters(page, CARVED_CHARS);
    // The mechanism gallery's worklist may hold more than just PLACED_CHAR —
    // an accepted marks-series proposal (spec 046) and the case-pair
    // uppercase companion (#1411) can both widen it (see
    // driveMechanismsGallery's doc comment in helpers/surveyFlow.ts) — the
    // shared driver walks whatever is actually there; PLACED_CHAR's own
    // landing is proven below from the emitted ZIP, not from a per-character
    // click here.
    await driveMechanismsGallery(page);
    await confirmImportAdaptDefault(page);
    // The touch gallery's own walk list (TouchGallery.tsx's touchLettersToAdd)
    // widens for the same reason lettersToAdd did in Mechanisms: every
    // character that now carries a desktop MechanismAssignment (é AND its
    // widened worklist siblings — see driveMechanismsGallery's doc comment)
    // becomes a `desktopSuggestionTargets` entry and therefore a touch-gallery
    // walk stop, not just PLACED_CHAR. A hard-coded "accept the suggestion for
    // é, click touch-continue once" driver assumed exactly one stop and hung
    // waiting for a "Use suggested long-press method for é" button that never
    // rendered (the gallery opened on a different worklist character first) —
    // see specs/057-bulletproof-navigation/reviews/classB-diagnosis.md. The
    // shared, worklist-size-agnostic driver walks every character with the
    // default long-press method regardless of count; PLACED_CHAR's own
    // landing is proven below from the emitted ZIP, not from an in-gallery
    // "Accept" click.
    await driveTouchGallery(page);

    // Accessibility gate (spec 056 FR-003): scan the post-touch-gallery screen.
    // 1.4.3 -- the "<char> -- K_<key>" glyph chips this screen lists, plus the
    // shared chrome (documented pre-existing contrast debt; see
    // helpers/contrastDebt.ts). The OSK iframe's own debt is now fixed at
    // the source; OSK_IFRAME_DEBT is now an empty spread, kept only so this
    // call site doesn't need a rename.
    await expectNoSeriousAxeViolations(page, "after touch gallery (US1 bambara walk)", {
      exclude: [...GLYPH_KEY_CHIP_DEBT, ...SHARED_CHROME_DEBT, ...OSK_IFRAME_DEBT],
    });

    await driveHelpPhase(
      page,
      "Welcome to the Bambara keyboard.",
      "Type ɛ, ɔ, and ŋ directly from the base layout.",
    );

    await page.waitForURL(/#output$/, { timeout: 30_000 });

    // Accessibility gate (spec 056 FR-003): scan the output screen.
    // 1.4.3 -- the Output screen's documented pre-existing contrast debt.
    await expectNoSeriousAxeViolations(page, "output screen (US1 bambara walk)", {
      exclude: OUTPUT_SCREEN_DEBT,
    });

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
