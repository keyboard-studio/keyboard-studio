// E2E: spec 104 (touch key identity criteria) — T023, SC-006.
//
// Four walks through the real studio, one per spec-104 surface the unit
// suites cannot reach:
//
//   1. Creation + start-of-line default (US1, FR-013 as amended by #2374):
//      a new keyboard whose alphabet carries a combining mark passes the
//      marks series with the "at the start of a line" box unticked; a mark
//      assigned in the touch editor then mints as a guarded T_ key
//      (T_0301, not U_0301), severed automatically on the Copy track, and
//      the OSK preview proves the guard: the mark alone types nothing,
//      after a letter it lands.
//   2. Copy parity (US2, FR-014/FR-015): copying sil_cameroon_qwerty
//      ships every T_ identity and every T_-naming rule the source has
//      (the artefact-level parity the harness can assert; tap-level
//      parity is the T014 unit gate in the copy flow itself). Copying
//      basic_kbdus — whose touch layout is full of rule-free T_<HEX>
//      keys — surfaces the repair list at the touch step, and leaving
//      it unvisited lists the unapplied repairs at Output (FR-015's
//      ruling: preselection is not consent).
//   3. Adapt + repair (US3, FR-009): adapting basic_kbdus, applying the
//      criteria-default repair (convert T_0031 to U_0031) makes the key
//      type in the live OSK preview (symbol layer, tap U_0031 → "1").
//   4. Track 2 choice + FR-017 (US3, FR-016/FR-017/FR-018): on Adapt, an
//      editor edit that would sever a K_ link is held and decided inline;
//      "keep the link" is recorded and pins the choice — re-triggering
//      the identical edit (after renaming the key back, the only editor
//      gesture that re-poses the same question) is NOT re-presented,
//      while a different edit (a different target character) IS, and
//      accepting it severs with the severance line shown.
//
// Known gap, stated plainly: FR-017's other re-presentation trigger — the
// fingerprint change when the source key's bound .kmn rules are edited —
// has no gesture inside the touch editor (rule text is not editable
// there), so walk 4 exercises the different-target trigger live and the
// fingerprint trigger stays with the unit suite
// (lib/touchKeyIdentity.test.ts, "FR-017 decline suppression").
//
// Run:
//   cd packages/studio && npx playwright test touch-key-identity.spec.ts
// In the CI e2e lane's desktop filter list (ci.yml). Local runs on a
// memory-tight VM may starve the Chromium renderer next to the Vite dev
// server — the lane is the authority when a local run cannot complete.

import { test, expect, type Page, type FrameLocator } from "playwright/test";
import { unzipSync } from "fflate";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  chooseAdaptTrack,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  drivePunctuationStep,
  driveInvisiblesStep,
  driveConvenienceStep,
  driveMarksSeries,
  driveDeadkeysStep,
  driveMechanismsGallery,
  navigateToOutput,
  triggerDownload,
} from "./helpers/surveyFlow";
import {
  driveToTouchStep,
  enterTouchKeyMode,
  dismissTouchIntro,
} from "./helpers/touchKeyWalk";

const OSK_FRAME_SELECTOR = 'iframe[src="/osk-frame.html"]';

// ---------------------------------------------------------------------------
// OSK preview helpers (mirrors touch-key-assign.spec.ts's own pair — the
// preview's keys carry KMW's internal `keyId` expando, readable only via
// evaluate; see that spec's header for the full rationale)
// ---------------------------------------------------------------------------

async function oskHasKeyId(oskFrame: FrameLocator, keyId: string): Promise<boolean> {
  return oskFrame.locator(".kmw-key").evaluateAll(
    (els, id) => els.some((el) => (el as unknown as { keyId?: string }).keyId === id),
    keyId,
  );
}

async function clickOskKeyById(oskFrame: FrameLocator, keyId: string): Promise<void> {
  const keys = oskFrame.locator(".kmw-key");
  const count = await keys.count();
  for (let i = 0; i < count; i++) {
    const isMatch = await keys.nth(i).evaluate(
      (el, id) => (el as unknown as { keyId?: string }).keyId === id,
      keyId,
    );
    if (isMatch) {
      await keys.nth(i).click();
      return;
    }
  }
  throw new Error(`OSK key with keyId "${keyId}" was not found in the rendered preview`);
}

// ---------------------------------------------------------------------------
// Walk-shared preludes
// ---------------------------------------------------------------------------

/**
 * Carve (nothing carved) → deadkeys → rules → mechanisms, the gallery
 * tail every full walk here shares (mirrors copy-edit.spec.ts's
 * finishGalleryWork without its carve/placement options).
 */
async function finishGalleryWork(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await driveDeadkeysStep(page);
  await page.getByTestId("rules-continue").click();
  await driveMechanismsGallery(page);
}

/** From the mechanisms step into the touch step (character mode, intro dismissed). */
async function enterTouchStep(page: Page): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("seed-source-confirm").click();
  await dismissTouchIntro(page);
}

/**
 * basic_kbdus (walks 2b + 3) from a cold browser to the touch step.
 * basic_kbdus is the repair fixture: its touch layout carries rule-free
 * producing T_ keys (T_0031… on the symbol layer) and its .kmn names no
 * T_ id at all, so the spec 104 repair list has real rows to show.
 * Phase B adds one already-produced character ("a") — the walk is about
 * the imported keys, not about new-character placement.
 */
async function driveToBasicKbdusTouchStep(
  page: Page,
  track: "copy" | "adapt",
): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, {
    english: "Test",
    autonym: "Test",
    script: "Latn",
    languageCode: "en",
  });
  await pickStartKeyboard(page, "basic_kbdus");
  if (track === "copy") {
    await chooseTrackCopy(page);
  } else {
    await chooseAdaptTrack(page);
  }
  await driveAttributionStep(page);
  if (track === "copy") await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, "a");
  await finishGalleryWork(page);
  await enterTouchStep(page);
  await expect(page.getByTestId("touch-key-identity-list")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Walk 4's rename-back gesture: select the key (by its cell testid
 * suffix), open the key-grid command menu from the cell's context menu,
 * and rename it via RenameDialog. Renaming is the one editor gesture
 * that re-poses an identity question about the same source key — the
 * assign overlay never touches the IR, so the FR-017 fingerprint the
 * declined choice was pinned against is exactly what it was.
 */
/**
 * The locator for one grid CELL by its address suffix. It MUST carry the
 * `key-grid-cell-` prefix (the touch-mode-toggle.spec.ts convention): every
 * cell is preceded in the DOM by its left-padding spacer,
 * `key-grid-pad-<address>`, whose testid ends with the same address — an
 * unscoped suffix locator's `.first()` therefore resolves to the aria-hidden
 * pad span, the click selects nothing and focuses nothing, and a following
 * F2 goes nowhere (the failure this walk shipped with).
 */
function cellByAddressSuffix(page: Page, suffix: string) {
  return page.locator(`[data-testid^="key-grid-cell-"][data-testid$="${suffix}"]`).first();
}

async function renameKeyViaCommandMenu(
  page: Page,
  cellTestIdSuffix: string,
  newId: string,
): Promise<void> {
  const cell = cellByAddressSuffix(page, cellTestIdSuffix);
  await cell.click();
  await cell.click({ button: "right" });
  await expect(page.getByTestId("key-grid-command-menu")).toBeVisible({
    timeout: 10_000,
  });
  // The rename descriptor's id is "rename-key" (TouchGallery's
  // extraCommandMenuCommands), so its testid is key-grid-command-rename-key.
  await page.getByTestId("key-grid-command-rename-key").click();
  const field = page.getByTestId("rename-dialog-field");
  await expect(field).toBeVisible({ timeout: 10_000 });
  await field.fill(newId);
  await page.getByTestId("rename-dialog-confirm").click();
  await expect(page.getByTestId("rename-dialog-field")).toHaveCount(0, {
    timeout: 10_000,
  });
}

/** F2 into AssignPanel for the currently selected key, type a U+XXXX
 *  notation, and submit with Enter (the touch-key-assign.spec.ts shape). */
async function assignCharToSelectedKey(page: Page, notation: string): Promise<void> {
  await page.keyboard.press("F2");
  const charField = page.getByLabel("Character or code point");
  await expect(charField).toBeFocused();
  await page.keyboard.type(notation);
  await expect(page.getByTestId("assign-panel-proposal")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("assign-panel-confirm")).toBeEnabled();
  await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// Walk 1 — creation: the start-of-line default mints guarded T_ marks (#2374)
// ---------------------------------------------------------------------------

test.describe("spec 104 walk 1: creation with the start-of-line default", () => {
  test("start-of-line box unticked → a mark assigned in the editor mints T_0301, severs with the line shown, and the OSK guard swallows a lone mark", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await seedReturningVisitor(page);
    await page.goto("/");
    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Test",
      script: "Latn",
      languageCode: "fr",
    });
    await pickStartKeyboard(page, "basic_kbdfr");
    await chooseTrackCopy(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);

    // Phase B with a decomposable letter ("é" = e + U+0301): the marks
    // series renders. The attachment station's "at the start of a line"
    // box stays unticked (the #2374 default), so no guard station appears.
    await page.waitForSelector('[data-testid="charlist-continue"]', { timeout: 15_000 });
    await page.click('[data-testid="charlist-continue"]');
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', "é");
    await page.getByTestId("charlist-add").click();
    await page.waitForSelector('[data-testid="charlist-done"]:not([disabled])', {
      timeout: 5_000,
    });
    await page.click('[data-testid="charlist-done"]');
    await driveMarksSeries(page);
    await drivePunctuationStep(page);
    await driveInvisiblesStep(page);
    await driveConvenienceStep(page);

    await finishGalleryWork(page);
    await enterTouchStep(page);

    // By-key mode: redefine the touch 1 key (K_1, the first key on the
    // default layer — QS-5's own worked example) to the combining mark.
    await page.getByTestId("touch-mode-tab-key").click();
    await expect(page.getByTestId("key-grid")).toBeVisible({ timeout: 15_000 });
    await cellByAddressSuffix(page, ":default:K_1").click();

    await page.keyboard.press("F2");
    const charField = page.getByLabel("Character or code point");
    await expect(charField).toBeFocused();
    await page.keyboard.type("U+0301");
    // The start-of-line box was left unticked (the #2374 default), so the
    // proposal is the guarded T_ mint — NOT the U_0301 an allowed-at-line-
    // start mark would get.
    await expect(page.getByTestId("assign-panel-proposal")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("assign-panel-proposal")).toContainText("T_0301");
    await expect(page.getByTestId("assign-panel-confirm")).toBeEnabled();
    await page.keyboard.press("Enter");

    // Copy track: severance is automatic (FR-011) and announced with the
    // contracts §6 line in the gallery's live region (FR-018).
    await expect(page.getByTestId("touch-key-severance-notice")).toBeVisible({
      timeout: 15_000,
    });
    await expect(charField).toHaveValue("");

    // The live preview: the redefined key exists under its T_ id, and
    // the unticked start-of-line default is real KMW behaviour — a mark at
    // the start of
    // a word (after a space) is swallowed; after a letter, it lands.
    await page.getByTestId("touch-mode-tab-character").click();
    const oskFrame = page.frameLocator(OSK_FRAME_SELECTOR);
    await expect
      .poll(() => oskHasKeyId(oskFrame, "T_0301"), {
        message: "the guarded T_0301 key never appeared in the live preview",
        timeout: 30_000,
      })
      .toBe(true);
    const oskTarget = oskFrame.locator("#osk-target");
    // Start-of-word probe = after a space (ruling 2026-10-20, spec 104
    // Clarifications Session 2026-10-20): the guard idiom
    // (any(generated_touch_guard) + [T_0301] > context) can only match a
    // character that exists — a space, a number, punctuation — and Keyman
    // has no beginning-of-context primitive, so a tap at a truly EMPTY
    // context is not swallowed by any keyboard built on the idiom,
    // including the shipped sil_cameroon_qwerty. That is why SC-002's
    // context probes are letter/space/deadkey and omit empty. The space
    // tap below is the canonical start-of-word case the old guard question
    // named; the mark tap after it must leave the field at just " ".
    await clickOskKeyById(oskFrame, "K_SPACE");
    await clickOskKeyById(oskFrame, "T_0301");
    await expect(oskTarget).toHaveValue(" ");
    await clickOskKeyById(oskFrame, "K_E");
    await expect(oskTarget).not.toHaveValue("");
    await clickOskKeyById(oskFrame, "T_0301");
    await expect(oskTarget).toHaveValue(
      /(\u0301|[éèêëàáâäíìîïóòôöúùûüýÿç])/,
    );
  });
});

// ---------------------------------------------------------------------------
// Walk 2 — Copy: parity for Cameroon, repair surface for basic_kbdus
// ---------------------------------------------------------------------------

test.describe("spec 104 walk 2: copy parity and the repair list", () => {
  test("copying sil_cameroon_qwerty ships every T_ identity and T_ rule the source has, with no repairs outstanding", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await seedReturningVisitor(page);
    await page.goto("/");
    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Test",
      script: "Latn",
      languageCode: "agq",
    });
    await pickStartKeyboard(page, "sil_cameroon_qwerty");
    await chooseTrackCopy(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "ɨ");
    await finishGalleryWork(page);
    await navigateToOutput(page);

    // Cameroon has no dead keys: nothing may be listed as unapplied.
    await expect(page.getByTestId("touch-key-unapplied-repairs")).toHaveCount(0);

    const download = await triggerDownload(page);
    const dlPath = await download.path();
    expect(dlPath).not.toBeNull();
    const entries = Object.entries(unzipSync(new Uint8Array(fs.readFileSync(dlPath!))));
    const dlLayout = entries.find(([name]) => name.endsWith(".keyman-touch-layout"));
    const dlKmn = entries.find(([name]) => name.endsWith(".kmn"));
    expect(dlLayout, "copy must ship a touch layout").toBeDefined();
    expect(dlKmn, "copy must ship a .kmn").toBeDefined();
    const dlLayoutText = new TextDecoder().decode(dlLayout![1]);
    const dlKmnText = new TextDecoder().decode(dlKmn![1]);

    // The source artefact the dev server itself serves (the sibling
    // keymanapp/keyboards clone) is the parity baseline.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcDir = path.resolve(
      here,
      "../../../../keyboards/release/sil/sil_cameroon_qwerty/source",
    );
    const srcLayoutText = fs.readFileSync(
      path.join(srcDir, "sil_cameroon_qwerty.keyman-touch-layout"),
      "utf8",
    );
    const srcKmnText = fs.readFileSync(path.join(srcDir, "sil_cameroon_qwerty.kmn"), "utf8");

    const layoutTIds = (text: string) =>
      new Set([...text.matchAll(/"id"\s*:\s*"(T_[^"]+)"/g)].map((m) => m[1]!));
    const kmnTIds = (text: string) =>
      new Set([...text.matchAll(/\[(T_[A-Za-z0-9_]+)\]/g)].map((m) => m[1]!));

    // FR-014 artefact parity: every T_ key id and every T_-naming rule
    // of the source survives the copy — guarded marks, the FCFA string
    // key, the frame keys, all of them.
    const missingLayoutIds = [...layoutTIds(srcLayoutText)].filter(
      (id) => !layoutTIds(dlLayoutText).has(id),
    );
    expect(missingLayoutIds, "T_ key ids lost by the copy").toEqual([]);
    const missingRuleIds = [...kmnTIds(srcKmnText)].filter(
      (id) => !kmnTIds(dlKmnText).has(id),
    );
    expect(missingRuleIds, "T_ rules lost by the copy").toEqual([]);
    expect(dlKmnText).toContain("FCFA");
  });

  test("copying basic_kbdus surfaces dead T_ keys as repair rows at the touch step, and the unvisited list is listed at Output", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await driveToBasicKbdusTouchStep(page, "copy");

    // FR-015: the repair list lives at the owning step (the touch step),
    // rows present before first download, defaults preselected.
    const rows = page.getByTestId("touch-key-repair-row");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(await rows.count()).toBeGreaterThan(0);
    const t0031Row = rows.filter({ hasText: "T_0031" }).first();
    await expect(t0031Row).toBeVisible();
    await expect(t0031Row).toContainText("symbol");

    // The author never answers the list. Download is not blocked, the
    // repairs pass through UNAPPLIED, and Output lists them (FR-015).
    await navigateToOutput(page);
    const unapplied = page.getByTestId("touch-key-unapplied-repairs");
    await expect(unapplied).toBeVisible({ timeout: 30_000 });
    await expect(unapplied).toContainText("T_0031");
  });
});

// ---------------------------------------------------------------------------
// Walk 3 — Adapt: apply a repair, the key types in the preview (FR-009)
// ---------------------------------------------------------------------------

test.describe("spec 104 walk 3: adapt with repair", () => {
  test("applying the default repair to dead T_0031 makes it produce '1' in the OSK preview", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await driveToBasicKbdusTouchStep(page, "adapt");

    const rows = page.getByTestId("touch-key-repair-row");
    const row = rows.filter({ hasText: "T_0031" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("symbol");

    // FR-009's criteria default for a T_<HEX> key whose suffix parses as
    // the keycap's codepoint: convert to U_0031 — preselected, not
    // applied until the author says so.
    const convertLabel = row.locator("label", {
      hasText: "Give it the Unicode name U_0031",
    });
    await expect(convertLabel).toBeVisible();
    await expect(convertLabel.locator('input[type="radio"]')).toBeChecked();

    await row.getByRole("button", { name: "Apply fix" }).click();
    await expect(row).toContainText("Fixed with the recommended repair.", {
      timeout: 15_000,
    });

    // The payoff, in the preview the author actually sees: switch the
    // OSK to the symbol layer and tap the repaired key — it types "1".
    // Before the repair this tap typed nothing (the T_ key had no rule).
    const oskFrame = page.frameLocator(OSK_FRAME_SELECTOR);
    await expect
      .poll(() => oskHasKeyId(oskFrame, "K_SYMBOLS"), {
        message: "the OSK preview never rendered",
        timeout: 30_000,
      })
      .toBe(true);
    await clickOskKeyById(oskFrame, "K_SYMBOLS");
    await expect
      .poll(() => oskHasKeyId(oskFrame, "U_0031"), {
        message: "the repaired U_0031 key never appeared in the OSK preview",
        timeout: 30_000,
      })
      .toBe(true);
    await clickOskKeyById(oskFrame, "U_0031");
    await expect(oskFrame.locator("#osk-target")).toHaveValue(/1/);
  });
});

// ---------------------------------------------------------------------------
// Walk 4 — Track 2 choice: decline, suppression, re-presentation (FR-017)
// ---------------------------------------------------------------------------

test.describe("spec 104 walk 4: Track 2 identity choice and decline suppression", () => {
  test("keep-the-link is recorded and not re-presented for the identical edit; a different edit re-presents and severs on accept", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await driveToTouchStep(page, "import-adapt");
    await enterTouchKeyMode(page);

    // This walk's edits live on the SHIFT layer, and the grid must be
    // switched to it explicitly: entering key mode carries the
    // character-mode context with it (FR-036c), landing on whatever layer
    // the carried character lives on (numeric for this keyboard), and the
    // grid renders only the active layer. Shift is also the only layer
    // where the walk's script can run at all: bambara's shipped layout
    // has no K_A on default (its a-key is U_0061), K_A exists only on
    // shift — and the two characters assigned below (æ, đ) are chosen
    // because their U_ ids name no existing key, rule, or store-listed
    // id anywhere in the SESSION's layout. That bar rules out the
    // obvious candidates: ɛ (U_025B already names the default layer's ɛ
    // key) and ø (the shared prelude's PLACED_CHAR, already placed on a
    // key by the mechanisms phase). For either, the severance transplant
    // correctly REFUSES per FR-016 and the choice collapses to
    // keep/flag — a different walk's subject.
    await page.getByTestId("key-layer-selector-option-shift").click();
    await expect(
      page.getByRole("grid", { name: "Editable touch key layout — shift layer" }),
    ).toBeVisible({ timeout: 15_000 });

    const choice = page.getByTestId("touch-key-identity-choice");
    const decisionRows = page.getByTestId("touch-key-decision-row");

    // --- The triggering edit: redefine K_A to æ on the Adapt track.
    await cellByAddressSuffix(page, ":shift:K_A").click();
    await assignCharToSelectedKey(page, "U+00E6");

    // FR-018: the commit is held; the choice is decided inline, with the
    // criteria's recommendation (sever) preselected and the keep-link
    // consequence stated (FR-016).
    await expect(choice).toBeVisible({ timeout: 15_000 });
    await expect(
      choice.getByRole("radio", { name: /Put this key on its own/ }),
    ).toBeChecked();

    // --- Decline: keep the link. The edit stands as authored, the
    // decision is recorded durably, and no severance line is shown.
    await choice.getByRole("radio", { name: /Keep the link/ }).check();
    await choice.getByRole("button", { name: "Use this choice" }).click();
    await expect(choice).toHaveCount(0);
    await expect(
      decisionRows.filter({ hasText: "Kept the link for" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("touch-key-severance-notice")).toHaveCount(0);

    // --- FR-017: rename the key back to K_A (the assign renamed it to
    // U_00E6 as authored) and re-trigger the IDENTICAL edit. The
    // standing keep answer commits it without re-presenting the choice.
    await renameKeyViaCommandMenu(page, ":shift:U_00E6", "K_A");
    await cellByAddressSuffix(page, ":shift:K_A").click();
    await assignCharToSelectedKey(page, "U+00E6");
    // The commit landing (AssignPanel's field reset) with the choice
    // never appearing is the suppression signal; give any erroneous
    // presentation a window to appear before asserting its absence.
    await expect(page.getByLabel("Character or code point")).toHaveValue("", {
      timeout: 15_000,
    });
    await page.waitForTimeout(2_000);
    await expect(choice).toHaveCount(0);

    // --- A changed question re-presents: rename back once more and ask
    // for a different character (a different target id). The choice is
    // presented fresh — and accepting it severs, with the line shown.
    await renameKeyViaCommandMenu(page, ":shift:U_00E6", "K_A");
    await cellByAddressSuffix(page, ":shift:K_A").click();
    await assignCharToSelectedKey(page, "U+0111");
    await expect(choice).toBeVisible({ timeout: 15_000 });
    await choice.getByRole("radio", { name: /Put this key on its own/ }).check();
    await choice.getByRole("button", { name: "Use this choice" }).click();
    await expect(page.getByTestId("touch-key-severance-notice")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      decisionRows.filter({ hasText: "now stands on its own" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
