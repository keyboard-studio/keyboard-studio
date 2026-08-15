// E2E: spec 035 (mobile/touch layout derivation) — US2 "reseed from desktop" walk.
//
// Proves the Scenario B chain from specs/035-mobile-touch-derivation/quickstart.md
// (plus the US2-AS4 variant) — the fallback (P2) path taken when there is no
// usable base touch layout to import, or when the author explicitly discards one:
//
//   Test 1 (Scenario B, SC-002/SC-004): author from a base that SHIPS NO
//   `.keyman-touch-layout` -> carve N (>=1) desktop characters -> place M (>=1)
//   new letters in Mechanisms (desktop locks) -> the touch_seed_source fork step
//   DEFAULTS to "Reseed from desktop" (TouchSeedSourcePanel.tsx:
//   `hasUsableBaseLayout` is false when the base ships no layout at all, so
//   `selected` initializes to "reseed-from-desktop" — see the component's
//   `useState` default) -> walk the Touch gallery to completion (accepting the
//   carried-over suggestion for the placed letter satisfies the FR-008 coverage
//   gate) -> emit the ZIP and assert the derived `source/<id>.keyman-touch-layout`:
//     - is the GENERATED TABLET PROJECTION — exactly one platform, id
//       "tablet", carrying default + shift + numeric layers (plus the
//       "rightalt" secondary layer pid_piaroa's surviving RALT rules produce).
//       scaffoldTouchLayout's Case A generate-from-scratch shape, since there
//       is no base layout to start from at all. The platform is "tablet", NOT
//       "phone": buildCaseASeed (studio/src/lib/buildTouchLayoutJson.ts) is the
//       codebase's only `platformStyle: "tablet"` caller and the reseed path
//       routes through it. Commit 8709ff54 introduced that skeleton; these
//       assertions kept reading `phone` until spec 057 caught up, which made
//       them VACUOUS rather than failing — see the TouchLayoutJson doc comment,
//     - contains NEITHER of the N carved characters anywhere in the document,
//     - contains the M placed character,
//     - contains at least one UNTOUCHED language-specific base character (proof
//       this is not a bare QWERTY scaffold — the character survives because it
//       is still produced by an un-carved desktop rule, landing in the tablet
//       projection's "rightalt" layer — see below),
//     - and the keyboard compiles (the emit-download gate, same compile-clean
//       signal carve.spec.ts / copy-edit.spec.ts / touch-derivation-us1.spec.ts
//       rely on).
//
//   Test 2 (US2-AS4 variant): on the Scenario-A base (bambara — the SAME
//   fixture touch-derivation-us1.spec.ts uses, which ships a real "phone"
//   platform touch layout), explicitly CHOOSE "Reseed from desktop" instead of
//   accepting the "Import & adapt" default. Asserts the emitted layout is the
//   DESKTOP PROJECTION, NOT the shipped bambara layout:
//     - the emitted platform key set is exactly ["tablet"], while bambara
//       ships exactly ["phone"] — so the shipped platform is provably GONE,
//       not augmented or carried forward (buildTouchLayoutJson.ts Case A:
//       `const { touchLayout: _stripped, ...rest } = baseIr;` strips the
//       shipped layout before scaffoldTouchLayout runs — R10 — specifically so
//       a "reseed" never silently carries the base's own platforms forward),
//     - the shipped-layout-only marker `font === "Tahoma"` (present on
//       bambara's real file — confirmed via a throwaway Node probe, see below)
//       is ABSENT.
//   The platform-key comparison replaced an "every row <=10 keys" check that
//   was the original discard proof. Once the reseed began emitting a `tablet`
//   platform that check iterated an empty `touchJson.phone?.layer ?? []` and
//   asserted nothing at all — and the tablet skeleton's own digit row is 11
//   keys wide, so it would not have held even when pointed at the real
//   platform. The key set is both stricter and true.
//   Also verifies the reseed card's phone/desktop-drop advisory
//   (TouchSeedSourcePanel.tsx's `hasOtherPlatforms` conditional text) is
//   correctly ABSENT for bambara, since bambara's shipped touch layout ships
//   ONLY a "phone" platform — confirmed via the same probe (`Object.keys(d)`
//   on the parsed JSON returns exactly `["phone"]`). The advisory has no
//   dedicated data-testid (it is inline text inside the `seed-source-reseed`
//   card), so the assertion reads that card's text content directly.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test touch-derivation-us2.spec.ts
//
// LIVE (un-skipped). This spec now consumes the shared survey-prelude helpers
// from e2e/helpers/surveyFlow.ts (the de-triplication follow-up carve.spec.ts /
// copy-edit.spec.ts / touch-derivation-us1.spec.ts already landed), fixed once
// for the spec 036 glottolog language-identify flow ("What is your language
// called in English?" combobox, "Step 1 of ~6"). Everything downstream of the
// prelude (carve targets, seed-source default and explicit-choice paths,
// touch-gallery walk, ZIP assertions) was traced to source and cross-checked
// against TouchSeedSourcePanel.tsx / buildTouchLayoutJson.ts /
// scaffoldTouchLayout.ts; both fixtures' codec-cleanliness / touch-layout
// shipping were confirmed via throwaway vitest probes against
// packages/engine/src (parse() over each candidate's .kmn, deleted afterward)
// and a throwaway Node probe over bambara's raw .keyman-touch-layout JSON
// (also deleted afterward).

import { test, expect, type Page } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { OUTPUT_SCREEN_DEBT } from "./helpers/contrastDebt";
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
// Fixture constants — Test 1 (Scenario B): Piaroa.
//
// Chosen (over the candidate suggested in this task's brief, bj_cree_woods —
// see rejection note below) because it is the simplest codec-clean, no-touch-
// layout base found by scanning every `../keyboards/release/**/source/` folder
// for the ABSENCE of any `*.keyman-touch-layout` file (57 candidates), then
// probing each Latin/small candidate's .kmn with a throwaway parse() call:
//
//   - bj_cree_woods (the fixture carve.spec.ts uses) does NOT qualify here: it
//     ships no touch layout either, but its .kmn is deliberately NOT
//     codec-clean — carve.spec.ts picks it BECAUSE it contains a raw (opaque)
//     fragment (rule#93, `if(option_key = '') ...`), and its produced
//     characters are assembled via `index(store, n)` lookups keyed off
//     physical keycodes rather than one-rule-per-character literals, unlike
//     bambara's shape in touch-derivation-us1.spec.ts. Neither trait suits a
//     glyph-chip carve target.
//   - sil_zaiwa / slc_saliba (both also no-touch-layout) use `dk()` deadkey
//     groups for every produced character; the codec currently turns their
//     entire rule body into RawKmnFragment nodes (probed: 36 and 15 raw
//     fragments respectively, 0 typed IRRules) — disqualified outright.
//   - pid_piaroa (Piaroa, Saliban family, Venezuela — see
//     docs/keyboard-index.md) probes CLEAN: 0 raw fragments, and 8 of its 9
//     rules are exactly bambara-shaped — `+ [RALT K_X] > 'char'`, one rule per
//     produced character, no store/index/any() dependency in the rule body
//     itself. (The 9th rule, `any(vowel) + [RALT K_COMMA] > index(vowel,1)
//     $Cedilla`, is the sole outlier — it produces no literal `char` output at
//     all, so it never appears as a glyph chip and is irrelevant to this
//     walk's carve/place targets.) Codec-cleanliness is a separate layer from
//     the recognizer's pattern-grouping, though: the recognizer groups
//     CARVED_CHARS' rules into a recognized S-01 "Simple swap" pattern backed
//     by an output store, so carving them fires a "Remove everywhere?"
//     cascade confirm dialog in-app (see carveCharacters below) — the
//     rule-body simplicity that makes the .kmn codec-clean does not predict
//     cascade-free carving.
//   - Its RALT-modified rules land in scaffoldTouchLayout's "rightalt" layer
//     (classifyModifiers: RALT-alone -> "rightalt"), which is emitted as a FOURTH
//     layer alongside default/shift/numeric whenever at least one key has a
//     rightalt mapping (`hasRightAlt` in buildCanonicalPhoneLayers) — this is what
//     lets the untouched survivor character below land somewhere assertable in
//     the compact projection at all, since pid_piaroa never touches the plain
//     (unmodified) a/o/u/n keys.
// ---------------------------------------------------------------------------

const PIAROA_BASE_ID = "pid_piaroa";

/** N (>=1; two chosen for parity with touch-derivation-us1.spec.ts's
 *  convention) carve targets — each produced by exactly ONE rule
 *  (`+ [RALT K_A] > 'ä'` / `+ [RALT K_O] > 'ö'`). The recognizer groups these
 *  rules into a recognized S-01 "Simple swap" pattern with an output store, so
 *  clicking their glyph chip opens a "Remove everywhere?" cascade confirm
 *  dialog (handled in carveCharacters below), not a plain toggle. Carving
 *  these also removes K_A/K_O's "rightalt" keyMap entries, so the derived touch
 *  layout's rightalt layer must lose both characters too (asserted below). */
const PIAROA_CARVED_CHARS = ["ä", "ö"] as const;

/** The untouched, language-specific survivor — `+ [RALT K_N] > 'ñ'` is never
 *  carved. Its "rightalt" keyMap entry survives into the reseeded phone
 *  projection, giving a concrete "not merely QWERTY" marker (SC-002). */
const PIAROA_SURVIVOR_CHAR = "ñ";

/** M (>=1) placed letter — reused verbatim from touch-derivation-us1.spec.ts
 *  (same reasoning: "é" is genuinely absent from pid_piaroa's own produced
 *  set — it only produces ä/ö/ü/ñ and their uppercase/cedilla forms, never
 *  "é" — so it survives into MechanismGallery's `lettersToAdd`, and the §3c
 *  deadkey default leaves Apply already enabled with zero field edits). */
const PLACED_CHAR = "é";

const PIAROA_KMN_ZIP_PATH = `source/${PIAROA_BASE_ID}.kmn`;
const PIAROA_TOUCH_ZIP_PATH = `source/${PIAROA_BASE_ID}.keyman-touch-layout`;

/**
 * #1477's ground-truth sweep (live axe run with this list emptied) found
 * every entry this list used to carry already clean: CarveGallery's/Rail's/
 * GlyphCell's v1-only surfaces are dead code (CarveGalleryV2 is
 * unconditional; v1 is commented out in carveAdapter.tsx), and
 * ConvenienceCharsStep's Continue button plus RemovalBanner's dismiss
 * control and region were stale exclusions from an earlier contrast pass
 * that already fixed them. Nothing left to exclude on this screen.
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [];

// ---------------------------------------------------------------------------
// Fixture constants — Test 2 (US2-AS4): bambara, identical to
// touch-derivation-us1.spec.ts's fixture (same carve/place targets), because
// AS4 is specifically about the SAME base, walked the SAME way up to the
// seed-source step, diverging only in the explicit choice made there.
// ---------------------------------------------------------------------------

const BAMBARA_BASE_ID = "bambara";
const BAMBARA_CARVED_CHARS = ["ɛ", "ŋ"] as const;
const BAMBARA_SURVIVOR_CHAR = "ɔ";
const BAMBARA_TOUCH_ZIP_PATH = `source/${BAMBARA_BASE_ID}.keyman-touch-layout`;

// ---------------------------------------------------------------------------
// Page-object-lite helpers — the identity/base/track/prefill/build-list steps
// now come from the shared e2e/helpers/surveyFlow.ts module (same de-
// triplication carve.spec.ts / copy-edit.spec.ts / touch-derivation-us1.spec.ts
// already landed); wrapped locally where this spec needs a parametrized shape
// (two fixtures, two identities) or an extra readiness wait, mirroring
// touch-derivation-us1.spec.ts's wrapper pattern exactly. The remaining
// helpers below (carve/mechanisms/seed-source/touch-gallery/help/emit) are
// touch-derivation-035-specific and stay local.
// ---------------------------------------------------------------------------

/** Identity-lite (Phase A), parametrized by language identity. Latin script
 *  keeps routing through the ranked BaseResolution picker. Drops the stale
 *  `code` fill (spec 036's il_language_code question is optional and skipped
 *  by driveIdentityLiteBase, same as touch-derivation-us1.spec.ts) — base
 *  selection below resolves by explicit id search, not by code-driven
 *  ranking, so the walk still resolves without it. `identity.code` is kept in
 *  the parameter shape purely so call sites below don't need to change. */
async function driveIdentityLite(
  page: Page,
  identity: { autonym: string; code: string; script: string },
): Promise<void> {
  await driveIdentityLiteBase(page, {
    english: "Test",
    autonym: identity.autonym,
    script: identity.script,
  });
  // Additional wait for BaseResolution to render its picker (spec 035 may take longer)
  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
}

/** characters step, Phase B sub-stage (build-list method) — adds exactly ONE
 *  placed character. Parametrized version of touch-derivation-us1.spec.ts's
 *  helper (there it hardcodes PLACED_CHAR = "é"; both fixtures here use the
 *  same value, but the parameter keeps the helper honest about what it does). */
async function addPlacedCharacterToInventory(page: Page, char: string): Promise<void> {
  await buildOneCharacterList(page, char);
}

/** Carve gallery — carve `chars`, leave `survivor` untouched. Codec-clean and
 *  recognizer pattern-grouping are separate layers: both fixtures' .kmn are
 *  codec-clean (0 raw fragments, one rule per produced character), but that
 *  does not predict whether the recognizer groups a given rule into a
 *  pattern. Bambara's carve targets (touch-derivation-us1.spec.ts) resolve to
 *  ungrouped glyphs and plain-toggle; pid_piaroa's carve targets here group
 *  into a recognized S-01 "Simple swap" pattern with an output store, which
 *  opens a "Remove everywhere?" cascade confirm dialog instead — handled
 *  below by confirming the dialog when it appears. */
async function carveCharacters(
  page: Page,
  chars: readonly string[],
  survivor: string,
): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });

  for (const ch of chars) {
    const glyph = page.getByRole("button", { name: new RegExp(`^${ch}\\s`, "u") });
    await expect(glyph).toBeVisible();
    await glyph.click();

    // A character that belongs to a recognized pattern (e.g. an S-01 "Simple
    // swap" with an associated output store) opens a "Remove everywhere?"
    // cascade confirmation dialog instead of plain-toggling off — confirm it
    // if present so the walk proceeds to the next carve target.
    const confirmCascade = page.getByRole("button", { name: "Yes, remove everywhere" });
    if (await confirmCascade.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmCascade.click();
    }
  }

  const survivorGlyph = page.getByRole("button", { name: new RegExp(`^${survivor}\\s`, "u") });
  await expect(survivorGlyph).toBeVisible();
  await expect(survivorGlyph).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("carve-continue").click();
}

/**
 * touch_seed_source fork step — Scenario B path (spec 035 FR-006/R4): the
 * base ships NO usable touch layout at all, so TouchSeedSourcePanel's
 * `hasUsableBaseLayout` is false and the default selection MUST be
 * "reseed-from-desktop" (the component's `useState` default falls through to
 * it whenever there is nothing to import-adapt onto). Asserts the default
 * before confirming it — the mirror image of touch-derivation-us1.spec.ts's
 * `confirmImportAdaptDefault`.
 *
 * PREVIEW TESTID: the right-hand preview column is an EITHER/OR keyed on the
 * current selection (TouchSeedSourcePanel.tsx: `selected === "import-adapt" ?
 * <div data-testid="seed-source-preview"> : <div
 * data-testid="seed-source-reseed-preview">`), so on this path — where the
 * default IS reseed — `seed-source-preview` never exists. It is the wrong
 * handle here; `seed-source-reseed-preview` is the one that renders. This
 * helper waited on `seed-source-preview` (and on `seed-source-absent-note`,
 * which lives INSIDE the import-adapt branch) because both were correct when
 * it was written: the column used to be a single unconditional card holding
 * the absent-note whenever `preview === null`. Commit 8709ff54 split it in two
 * and moved the note under import-adapt, which silently invalidated both waits
 * — the helper had been asserting the reseed card was pressed while waiting
 * for markup that only renders when it is NOT. `Test 2`'s
 * `chooseReseedExplicitly` was unaffected because there the default really is
 * import-adapt.
 *
 * The "base ships no touch layout" fact is still surfaced selection-
 * independently, in the import-adapt card's own body copy
 * (`editor.touchSeed.importAdaptUnusable`, gated on the same
 * `hasUsableBaseLayout` the absent-note was), so that is what this now reads
 * — the Scenario B precondition is still asserted, not merely dropped.
 */
async function confirmReseedDefault(page: Page): Promise<void> {
  const reseed = page.getByTestId("seed-source-reseed");
  await expect(reseed).toBeVisible({ timeout: 15_000 });
  await expect(reseed).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("seed-source-reseed-preview")).toBeVisible();
  // The import-adapt-only card is genuinely absent, not merely unselected —
  // this is what distinguishes the reseed branch from the import-adapt one.
  await expect(page.getByTestId("seed-source-preview")).toHaveCount(0);

  const importAdapt = page.getByTestId("seed-source-import-adapt");
  await expect(importAdapt).toHaveAttribute("aria-pressed", "false");
  // Scenario B's precondition, in the copy that replaced the absent-note here.
  await expect(importAdapt).toContainText("There is no base touch layout to import");

  await page.getByTestId("seed-source-confirm").click();
}

/**
 * touch_seed_source fork step — US2-AS4 path: explicitly OVERRIDE the
 * "Import & adapt" default (bambara ships a usable base layout, so that is
 * what the panel initializes to) by clicking "Reseed from desktop" instead.
 *
 * Also asserts the platform-drop advisory's absence: bambara's shipped
 * `.keyman-touch-layout` ships ONLY a `"phone"` platform (confirmed via a
 * throwaway Node probe over the raw JSON — `Object.keys(parsed)` returns
 * exactly `["phone"]`), so TouchSeedSourcePanel's `hasOtherPlatforms`
 * (`platformIds.some((id) => id !== "phone")`) is false and the reseed card's
 * extra advisory sentence must NOT render. The advisory has no dedicated
 * data-testid (it is inline text inside the card), so this reads the card's
 * own text content directly.
 *
 * The asserted substring must match `editor.touchSeed.reseedDiscardsPlatforms`
 * verbatim. It previously read "…shipped tablet/desktop touch platforms",
 * which appears in no branch of the component — so the negative assertion was
 * vacuous and would have passed just as happily had the advisory rendered.
 * The shipped copy says "phone/desktop".
 */
async function chooseReseedExplicitly(page: Page): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });

  const importAdapt = page.getByTestId("seed-source-import-adapt");
  await expect(importAdapt).toHaveAttribute("aria-pressed", "true");

  const reseed = page.getByTestId("seed-source-reseed");
  await expect(reseed).toHaveAttribute("aria-pressed", "false");
  await expect(reseed).not.toContainText(
    "discards the base's shipped phone/desktop touch platforms",
  );

  await reseed.click();
  await expect(reseed).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("seed-source-confirm").click();
}

/** Emits the ZIP via the download gate and returns its parsed entries —
 *  shared tail shared by both tests below. */
async function emitAndUnzip(page: Page): Promise<Record<string, Uint8Array>> {
  const downloadButton = page.getByTestId("emit-download");
  await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton.click(),
  ]);

  const zipPath = await download.path();
  expect(zipPath).not.toBeNull();

  const zipBytes = await readFile(zipPath as string);
  return unzipSync(new Uint8Array(zipBytes));
}

interface TouchPlatformJson {
  font?: string;
  layer?: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }>;
}

/**
 * The emitted `.keyman-touch-layout` wire shape, keyed by PLATFORM ID.
 *
 * The reseed path emits exactly one platform, `tablet` — `buildCaseASeed`
 * (studio/src/lib/buildTouchLayoutJson.ts) is the codebase's only caller that
 * passes `platformStyle: "tablet"` to `scaffoldTouchLayoutWithDiagnostics`,
 * and that branch returns a single `{ id: "tablet" }` platform
 * (engine/src/scaffolder/scaffoldTouchLayout.ts, Case A). `phone` appears only
 * on a shipped or import-adapted layout, which is exactly what makes the
 * platform key itself the cleanest discriminator for AS4 below.
 *
 * This type was `PhoneTouchJson` and both tests read `touchJson.phone`, which
 * silently became `undefined` when commit 8709ff54 added the tablet reseed
 * skeleton. Every `for (const layer of touchJson.phone?.layer ?? [])` loop
 * then iterated an empty array — the assertions inside them were vacuous, not
 * passing.
 */
interface TouchLayoutJson {
  phone?: TouchPlatformJson;
  tablet?: TouchPlatformJson;
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Touch derivation US2 — reseed from desktop (spec 035 Scenario B)", () => {
  test("carved characters vanish, placed letter lands, layout is the generated tablet projection, and the keyboard compiles", async ({
    page,
  }) => {
    // Seed the returning-visitor flag before navigation so this fresh
    // browser context skips WelcomeScreen's first-visit gate.
    await seedReturningVisitor(page);
    await page.goto("/");

    await driveIdentityLite(page, { autonym: "Piaroa", code: "pid", script: "Latn" });
    await pickBaseKeyboard(page, PIAROA_BASE_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);

    // Spec 057 FR-072: a mid-walk tab round trip, folded into an existing long
    // walk so position survival is proven incidentally rather than only by the
    // dedicated gating spec. Before the D-1 fix this single pair of clicks was
    // enough to throw the whole walk back to the identity question — every
    // assertion below it would have failed.
    await switchTab(page, "preview");
    await switchTab(page, "survey");
    await addPlacedCharacterToInventory(page, PLACED_CHAR);

    // Accessibility gate (spec 056 FR-003): scan the Phase B build-list screen.
    await expectNoSeriousAxeViolations(page, "phase B build list (US2 piaroa walk)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // Manifest spine order (StudioShell.tsx): characters -> marks -> carve ->
    // mechanisms -> touch_seed_source -> touch -> help. The marks series for
    // the accented PLACED_CHAR was driven inside addPlacedCharacterToInventory.
    await carveCharacters(page, PIAROA_CARVED_CHARS, PIAROA_SURVIVOR_CHAR);
    // The mechanism gallery's worklist may hold more than just PLACED_CHAR —
    // see driveMechanismsGallery's doc comment in helpers/surveyFlow.ts; the
    // shared driver walks whatever is actually there, and PLACED_CHAR's own
    // landing is proven below from the emitted ZIP.
    await driveMechanismsGallery(page);
    await confirmReseedDefault(page);
    // The touch gallery's own walk list widens for the same reason
    // lettersToAdd did in Mechanisms (TouchGallery.tsx's touchLettersToAdd
    // includes every character with a desktop MechanismAssignment, not just
    // PLACED_CHAR) — see driveMechanismsGallery's doc comment and
    // specs/057-bulletproof-navigation/reviews/classB-diagnosis.md. The
    // shared, worklist-size-agnostic driver walks every character with the
    // default long-press method regardless of count; PLACED_CHAR's own
    // landing is proven below from the emitted ZIP.
    await driveTouchGallery(page);

    // Accessibility gate (spec 056 FR-003): scan the post-touch-gallery screen.
    // #1477's ground-truth sweep found this screen's glyph chips and shared
    // chrome already clean, and fixed LintChip's code badge at the source
    // (lint/colors.ts's SEVERITY_COLORS consumers; LintSummary is survey-pane
    // chrome, and pid_piaroa's .kmn keeps a finding in the list for the whole
    // walk, so this screen exercised the live bug directly). Nothing left to
    // exclude here.
    await expectNoSeriousAxeViolations(page, "after touch gallery (US2 piaroa walk)", {
      exclude: [],
    });

    await driveHelpPhase(
      page,
      "Welcome to the Piaroa keyboard.",
      "Use Right Alt to type ä, ö, ü, and ñ.",
    );

    await page.waitForURL(/#output$/, { timeout: 30_000 });
    // 1.4.3 -- the Output screen's documented pre-existing contrast debt.
    await expectNoSeriousAxeViolations(page, "output screen (US2 piaroa walk)", {
      exclude: OUTPUT_SCREEN_DEBT,
    });

    const entries = await emitAndUnzip(page);

    // .kmn sanity — the carved characters must not survive in the desktop
    // source either.
    const kmnBytes = entries[PIAROA_KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${PIAROA_KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);
    for (const ch of PIAROA_CARVED_CHARS) {
      expect(kmnText, `.kmn must not still produce carved char ${ch}`).not.toContain(`'${ch}'`);
    }

    // ---------------------------------------------------------------------
    // Touch-layout assertions (FR-002/004/005/008, SC-002/SC-004).
    // ---------------------------------------------------------------------
    const touchBytes = entries[PIAROA_TOUCH_ZIP_PATH];
    expect(touchBytes, `expected ${PIAROA_TOUCH_ZIP_PATH} in the emitted zip`).toBeDefined();
    const touchText = strFromU8(touchBytes as Uint8Array);
    const touchJson = JSON.parse(touchText) as TouchLayoutJson;

    // Generated-from-scratch projection: pid_piaroa ships no touch layout at
    // all, so Case A scaffolds one, and the reseed path's skeleton is the
    // TABLET one — exactly one platform, id "tablet". Asserting the platform
    // key set (rather than just reading one key) is what keeps this honest:
    // the previous `touchJson.phone` reads went undefined-silent when the
    // tablet skeleton landed, and every assertion under them stopped running.
    expect(Object.keys(touchJson), "reseed emits exactly one tablet platform").toEqual(["tablet"]);

    // default + shift + numeric layers present. The "rightalt" secondary layer
    // is also expected here — pid_piaroa's surviving RALT-modified rules put
    // it there (see the fixture-choice rationale above), and it is where the
    // survivor character below lives; its presence does not contradict
    // SC-002's "default + shift + numeric" wording, which names the
    // always-present trio, not an exhaustive layer list.
    const layerIds = touchJson.tablet?.layer?.map((l) => l.id) ?? [];
    for (const requiredLayer of ["default", "shift", "numeric"]) {
      expect(layerIds, `expected a "${requiredLayer}" layer`).toContain(requiredLayer);
    }
    expect(layerIds, 'surviving RALT rules must produce a "rightalt" layer').toContain("rightalt");

    // NOTE: no "<=10 keys per row" assertion here any more. That was
    // buildCanonicalPhoneLayers's compact-PHONE-row invariant, and the tablet
    // skeleton deliberately does not satisfy it — its digit row is 1-0 plus
    // K_BKSP, 11 keys wide (buildTabletLayers, engine/src/scaffolder/
    // scaffoldTouchLayout.ts). It was never failing here only because it was
    // iterating the empty `touchJson.phone?.layer ?? []`. The platform-key
    // assertion above is the load-bearing "this is the generated skeleton"
    // proof now; row widths are the skeleton's own business.

    // NONE of the N carved characters appear anywhere in the document.
    for (const ch of PIAROA_CARVED_CHARS) {
      expect(touchText, `carved char ${ch} must not appear anywhere in the touch layout`).not.toContain(ch);
    }

    // The untouched, language-specific survivor still appears (proof this is
    // not a bare QWERTY-only scaffold).
    expect(touchText, "surviving base character must still appear").toContain(PIAROA_SURVIVOR_CHAR);

    // The M placed character is present.
    expect(touchText, "placed char must appear in the touch layout").toContain(PLACED_CHAR);
  });
});

test.describe("Touch derivation US2-AS4 — explicit reseed discards a shipped touch layout (spec 035)", () => {
  test("choosing Reseed on a base that ships a touch layout still produces the desktop projection, not the shipped layout", async ({
    page,
  }) => {
    // Seed the returning-visitor flag before navigation so this fresh
    // browser context skips WelcomeScreen's first-visit gate.
    await seedReturningVisitor(page);
    await page.goto("/");

    await driveIdentityLite(page, { autonym: "Bamanankan", code: "bm", script: "Latn" });
    await pickBaseKeyboard(page, BAMBARA_BASE_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await addPlacedCharacterToInventory(page, PLACED_CHAR);

    await carveCharacters(page, BAMBARA_CARVED_CHARS, BAMBARA_SURVIVOR_CHAR);
    // The mechanism gallery's worklist may hold more than just PLACED_CHAR —
    // see driveMechanismsGallery's doc comment in helpers/surveyFlow.ts; the
    // shared driver walks whatever is actually there, and PLACED_CHAR's own
    // landing is proven below from the emitted ZIP.
    await driveMechanismsGallery(page);
    await chooseReseedExplicitly(page);
    // Same widened worklist as Test 1 above (bambara's own S-02 assignments
    // for é AND its worklist siblings all become touch-gallery walk stops) —
    // the generic driver walks whatever is actually there.
    await driveTouchGallery(page);
    await driveHelpPhase(page, "Welcome to the Bambara keyboard.", "Type ɛ, ɔ, and ŋ from the freshly reseeded touch layout.");

    await page.waitForURL(/#output$/, { timeout: 30_000 });
    // 1.4.3 -- the Output screen's documented pre-existing contrast debt.
    await expectNoSeriousAxeViolations(page, "output screen (US2-AS4 bambara reseed walk)", {
      exclude: OUTPUT_SCREEN_DEBT,
    });

    const entries = await emitAndUnzip(page);

    const touchBytes = entries[BAMBARA_TOUCH_ZIP_PATH];
    expect(touchBytes, `expected ${BAMBARA_TOUCH_ZIP_PATH} in the emitted zip`).toBeDefined();
    const touchText = strFromU8(touchBytes as Uint8Array);
    const touchJson = JSON.parse(touchText) as TouchLayoutJson;

    // THE AS4 PROOF: bambara ships exactly one platform, `phone` (confirmed
    // via a throwaway Node probe over the raw JSON — `Object.keys(parsed)`
    // returns exactly `["phone"]`). The reseed emits exactly one platform,
    // `tablet`. So the emitted key set alone proves the shipped layout was
    // DISCARDED rather than augmented or carried forward: had R10's strip
    // (`const { touchLayout: _stripped, ...rest } = baseIr`) not run, the
    // shipped `phone` platform would still be here.
    expect(Object.keys(touchJson), "reseed must discard the shipped phone platform").toEqual([
      "tablet",
    ]);
    expect(touchJson.phone, "the shipped phone platform must not survive a reseed").toBeUndefined();

    // Shipped-layout-only marker ABSENT: bambara's real file carries
    // `"font": "Tahoma"` at the platform level (same probe); the
    // generate-from-scratch path never sets `font` at all. Belt-and-braces
    // behind the platform-key assertion above — and read off the platform
    // that actually exists, since `touchJson.phone?.font` is now trivially
    // undefined and would pass no matter what shipped.
    expect(touchJson.tablet?.font).not.toBe("Tahoma");

    // This pair replaces an "every row <=10 keys" loop that was the original
    // discard proof. It could no longer prove anything: it iterated
    // `touchJson.phone?.layer ?? []`, which the tablet reseed leaves empty, so
    // it ran zero assertions — and the tablet skeleton's own digit row is 11
    // keys wide, so it would not even hold if pointed at the real platform.

    // Belt-and-suspenders: the carved characters are still gone and the
    // placed character still lands, exactly as in touch-derivation-us1.spec.ts.
    for (const ch of BAMBARA_CARVED_CHARS) {
      expect(touchText, `carved char ${ch} must not appear anywhere in the touch layout`).not.toContain(ch);
    }
    expect(touchText, "placed char must appear in the touch layout").toContain(PLACED_CHAR);
  });
});
