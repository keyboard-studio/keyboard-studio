// E2E: the applyStoreSlotRemovals coordinated-drop fix (dual-use stores are
// no longer blocked; slot removals are coordinated aligned drops across
// any()/index() pair-sets instead of nul-filled/half-applied), plus the
// live-preview warnings/notices plumbing fix (CarveGallery's own preview
// pane now surfaces the CURRENT transform's warnings/notices on every
// recompile, not just the first).
//
// Fixture: sil_cameroon_qwerty (SIL Cameroon QWERTY — see
// docs/keyboard-index.md). Chosen because it is exactly the keyboard named
// in the bug report: carving ɛ/Ɛ used to hit
//   [store-slot] store "word" ... blocked from editing: it is both an
//   output target and an input source
// and leave the keyboard half-edited.
//
// DEVIATION FROM THE TASK BRIEF, stated up front: the task asked for a
// Track 2 (import/instantiateFromExisting) drive. Track 2 import via the
// SPA UI is NOT confirmed live as of this writing — see
// packages/studio/e2e/import-improve.spec.ts's header ("Track 2 import ...
// is not yet confirmed to be fully live"), which is still fully .skip-ped.
// window.__ksE2E__ (packages/studio/src/lib/e2eHook.ts) exposes only
// getWorkingIr()/getDeletedNodeIds() — no IR-injection entry point exists
// to drive Track 2 from the hook either. This spec therefore drives Track 1
// "Adapt" (instantiateFromBase) with sil_cameroon_qwerty as the base
// keyboard, mirroring carve.spec.ts's own pattern exactly (which also uses
// Track 1 with bj_cree_woods). The engine code path under test
// (applyStoreSlotRemovals / carveFilterIr / projectWorkingCopyVfs) is
// identical regardless of which track instantiated the working copy, so
// this substitution does not weaken the claim being verified.
//
// All removal actions are driven via real UI clicks (glyph chip -> cascade
// confirm dialog -> "Yes, remove everywhere"), never via a store bypass —
// window.__ksE2E__ has no cascadeDelete entry point, so UI-click was the
// only avenue anyway.
//
// Run: cd packages/studio && npx playwright test sil-cameroon-carve.spec.ts

import { test, expect, type Page } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import type { KeyboardIR } from "@keyboard-studio/contracts";

const BASE_KEYBOARD_ID = "sil_cameroon_qwerty";
const KMN_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.kmn`;

interface KsE2EHook {
  getWorkingIr(): KeyboardIR | null;
  getDeletedNodeIds(): string[];
}
declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

function surveyAdvance(page: Page) {
  return page.getByTestId("survey-advance");
}

async function driveIdentityLite(page: Page): Promise<void> {
  await page.locator("#il_language_autonym").fill("Kwasio");
  await surveyAdvance(page).click();
  await expect(page.locator("#il_language_english")).not.toHaveValue("");
  await surveyAdvance(page).click();
  await surveyAdvance(page).click(); // il_language_code, blank/optional
  await page.locator("#il_target_script").selectOption("other");
  await surveyAdvance(page).click();
  await expect(page.getByRole("combobox", { name: "Base keyboard" })).toBeVisible({
    timeout: 15_000,
  });
}

async function pickBaseKeyboard(page: Page, keyboardId: string): Promise<void> {
  const combobox = page.getByRole("combobox", { name: "Base keyboard" });
  await combobox.click();
  await combobox.fill(keyboardId);
  const option = page.getByRole("option", { name: new RegExp(keyboardId) }).first();
  await option.click();
  await page.getByTestId("base-confirm").click();
}

async function chooseAdaptTrack(page: Page): Promise<void> {
  await page.getByTestId("track-adapt").check();
  await surveyAdvance(page).click();
}

async function confirmPrefill(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}

async function buildOneCharacterList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Character to add").fill("a");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: /^Done \(1 character\)$/ }).click();
}

async function confirmMechanismsEmpty(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await expect(page.getByText("No new characters to add.")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("mechanisms-continue").click();
}

async function driveTouchGallery(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  const skipButton = page.getByRole("button", { name: /^Skip / });
  if (await skipButton.isVisible().catch(() => false)) await skipButton.click();
  await page.getByTestId("touch-continue").click();
}

async function driveHelpPhase(page: Page): Promise<void> {
  await page.locator("#pf_welcome_paragraph").fill("Welcome to the Cameroon QWERTY keyboard.");
  await surveyAdvance(page).click();
  await page.locator("#pf_usage_tip_1").fill("Use ; or AltGr to access special characters.");
  for (let guard = 0; guard < 15; guard++) {
    await surveyAdvance(page).click();
    if (/#output$/.test(page.url())) return;
  }
  throw new Error("driveHelpPhase: did not reach #output within the expected question count");
}

async function driveToCarveGallery(page: Page): Promise<void> {
  await page.goto("/?e2e=1");
  await driveIdentityLite(page);
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page);
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
}

interface EmitResult {
  kmnText: string;
  /** Text of the Output step's "Download projection warnings" status region, if rendered. */
  downloadWarningsText: string | null;
  /** Text of the Output step's "Download projection notices" status region, if rendered. */
  downloadNoticesText: string | null;
}

async function downloadAndUnzipKmn(page: Page): Promise<EmitResult> {
  await confirmMechanismsEmpty(page);
  await driveTouchGallery(page);
  await driveHelpPhase(page);
  await page.waitForURL(/#output$/);
  const downloadButton = page.getByTestId("emit-download");
  await expect(downloadButton).toBeEnabled({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);

  // The Output step's own projection-warnings banner (usePreviewArtifact ->
  // OutputScreen.tsx, role="status" aria-label="Download projection warnings")
  // — real problems only (see the engine's StoreSlotRemovalResult.notices
  // split; the coordinated-removal success message lives in the SEPARATE
  // "Download projection notices" region below, never here).
  const warningsRegion = page.getByRole("status", { name: "Download projection warnings" });
  const downloadWarningsText = (await warningsRegion.isVisible().catch(() => false))
    ? await warningsRegion.innerText()
    : null;

  // The Output step's neutral notices banner — informational confirmations
  // (e.g. the coordinated store-slot drop), never a problem.
  const noticesRegion = page.getByRole("status", { name: "Download projection notices" });
  const downloadNoticesText = (await noticesRegion.isVisible().catch(() => false))
    ? await noticesRegion.innerText()
    : null;

  const zipPath = await download.path();
  expect(zipPath).not.toBeNull();
  const zipBytes = await readFile(zipPath as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const kmnBytes = entries[KMN_ZIP_PATH];
  expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
  return { kmnText: strFromU8(kmnBytes as Uint8Array), downloadWarningsText, downloadNoticesText };
}

/** Extract a store's body text (everything after `store(name)` up to end of line/next store). */
function extractStoreLine(kmn: string, name: string): string {
  const re = new RegExp(`store\\(${name}\\)[^\\n]*`, "u");
  const m = kmn.match(re);
  expect(m, `expected store(${name}) in emitted .kmn`).not.toBeNull();
  return m![0].trim();
}

/**
 * Tokenize a store's items the way the KMN CODEC actually SEES them, not the
 * way a naive whitespace split would. The engine's emitter groups runs of
 * plain characters into quoted string literals ('...'/"...") rather than one
 * bare char per whitespace-separated token — e.g. dkf003b round-trips as
 * `store(dkf003b) ' 0)123$*9(bBcCdDeE...' U+030D U+0303 ... 'xXm\sS45678'`.
 * Splitting that on whitespace undercounts badly (a quoted run of N chars is
 * N logical store items, not 1). This walks the line char-by-char and
 * returns one entry per logical store item: a single character (quoted-run
 * members and bare chars alike), a resolved codepoint character for each
 * U+XXXX token, or the literal "nul" for a nul filler.
 */
function storeTokens(storeLine: string): string[] {
  const body = storeLine.replace(/^store\([^)]*\)\s*/, "");
  const items: string[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < body.length && body[j] !== quote) { items.push(body[j]!); j++; }
      i = j + 1;
      continue;
    }
    if (body.startsWith("U+", i)) {
      let j = i + 2;
      while (j < body.length && /[0-9A-Fa-f]/.test(body[j]!)) j++;
      const hex = body.slice(i + 2, j);
      items.push(String.fromCodePoint(parseInt(hex, 16)));
      i = j;
      continue;
    }
    // Bare word (e.g. "nul") — read until whitespace.
    let j = i;
    while (j < body.length && !/\s/.test(body[j]!)) j++;
    items.push(body.slice(i, j));
    i = j;
  }
  return items;
}

test.describe("sil_cameroon_qwerty — carving ɛ/Ɛ no longer blocks or corrupts the keyboard", () => {
  test("remove ɛ everywhere: no block warning, coordinated-drop info warning, live preview stays healthy, emitted .kmn is correct", async ({ page }) => {
    await driveToCarveGallery(page);

    // ---------------------------------------------------------------------
    // Step 2: navigate into the "main" group card and cascade-delete ɛ.
    // ---------------------------------------------------------------------
    await page.getByTestId("carve-card-group#0").click();
    await page.getByRole("button", { name: "ɛ — K_A", exact: true }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const dialogText = await dialog.innerText();
    // The cascade correctly resolves every location ɛ is produced from:
    // the main group's direct K_A rule, the dk_003B (deadkey-single-tap)
    // pattern, and the word store.
    expect(dialogText).toContain("Group: main");
    expect(dialogText).toContain("Pattern: Single-tap deadkey");
    expect(dialogText).toContain("Stores: word, dkt003b");
    await dialog.getByRole("button", { name: "Yes, remove everywhere" }).click();
    await expect(dialog).toBeHidden();

    // ɛ's cascade does NOT auto-include its uppercase pair Ɛ — the two are
    // distinct KeyboardIR store items/rules (RALT K_A vs SHIFT RALT K_A),
    // and collectCharContributors resolves by exact character, not by
    // case-fold. The original bug report's "two K_A rules deleted" (both
    // ɛ and Ɛ) came from the user cascading BOTH characters, not from one
    // cascade covering both — so this spec removes Ɛ via its own separate
    // cascade to match that reported scope exactly.
    await page.getByRole("button", { name: "Ɛ — K_A", exact: true }).click();
    const dialog2 = page.getByRole("alertdialog");
    await expect(dialog2).toBeVisible({ timeout: 5_000 });
    const dialog2Text = await dialog2.innerText();
    expect(dialog2Text).toContain("Group: main");
    expect(dialog2Text).toContain("Pattern: Single-tap deadkey");
    expect(dialog2Text).toContain("Stores: word, dkt003b");
    await dialog2.getByRole("button", { name: "Yes, remove everywhere" }).click();
    await expect(dialog2).toBeHidden();

    // ---------------------------------------------------------------------
    // Step 3a: no "blocked from editing" anywhere on the page, no alert
    // (real-problem) banner, and CarveGallery's OWN live-preview pane now
    // surfaces the coordinated-removal NOTICE (informational, never a
    // problem — see the engine's StoreSlotRemovalResult.notices split).
    //
    // Prior to the fix, useKeyboardArtifact's transformVersion recompile
    // effect called `runCompile(baseKeyboard, thisRunId, [], false)` with a
    // HARDCODED EMPTY warnings array on every reapply after the first —
    // discarding the very transformResult it had just computed, so this
    // notice never reached the preview during interactive carving (it only
    // surfaced later, at the Output step). That gap is now fixed: the
    // notice reaches the preview on the SAME cycle the coordinated splice
    // happens, rendered in a neutral role="status" block, never the orange
    // role="alert" "Carve warnings:" banner (the severity split — a success
    // confirmation is not a warning).
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // let the 300ms debounce settle regardless
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("blocked from editing");
    const carveWarningsBanner = page.getByRole("alert");
    expect(await carveWarningsBanner.count()).toBe(0);
    const carveNoticesBanner = page.getByRole("status", { name: /notices/i });
    await expect(carveNoticesBanner).toBeVisible({ timeout: 5_000 });
    await expect(carveNoticesBanner).toContainText(
      'coordinated removal across paired stores "dkf003b", "dkt003b"',
    );

    // ---------------------------------------------------------------------
    // Step 3c: the live preview pane reaches "ready" and the OSK iframe
    // renders the diacritic keys WITH captions.
    // ---------------------------------------------------------------------
    const frame = page.frameLocator('iframe[title="On-screen keyboard preview"]');
    for (const [keyId, expectedCaption] of [
      ["K_LBRKT", "́"],
      ["K_RBRKT", "̧"],
      ["K_QUOTE", "̀"],
      ["K_BKQUOTE", "̍"],
    ] as const) {
      const keyText = frame.locator(`#default-${keyId} .kmw-key-text`);
      await expect(keyText).toHaveText(new RegExp(expectedCaption), { timeout: 15_000 });
    }
    await page.screenshot({
      path: "/tmp/claude-0/-home-user/c7b38b00-f447-59c3-b756-94cab799b713/scratchpad/sil-cameroon-carve-preview.png",
      fullPage: true,
    });

    // ---------------------------------------------------------------------
    // Step 3b: continue the spine to Output and inspect the emitted .kmn.
    // ---------------------------------------------------------------------
    await page.getByTestId("carve-continue").click();
    const { kmnText, downloadWarningsText, downloadNoticesText } = await downloadAndUnzipKmn(page);

    // Step 3a (continued): "blocked from editing" never appears anywhere —
    // not in the (real-problem) warnings region (which may legitimately be
    // absent/null when there is nothing to warn about)...
    expect(downloadWarningsText ?? "").not.toContain("blocked from editing");
    // ...and the coordinated-removal success message surfaces in the
    // SEPARATE, neutral notices region, never conflated with a warning.
    expect(downloadNoticesText).not.toBeNull();
    expect(downloadNoticesText).toContain(
      'coordinated removal across paired stores "dkf003b", "dkt003b"',
    );

    const wordLine = extractStoreLine(kmnText, "word");
    expect(wordLine).not.toContain("ɛ");
    expect(wordLine).not.toContain("Ɛ");

    const finalLine = extractStoreLine(kmnText, "final");
    expect(finalLine).toBe("store(final) '.!?'");

    const dkfLine = extractStoreLine(kmnText, "dkf003b");
    const dktLine = extractStoreLine(kmnText, "dkt003b");
    const dkfTokens = storeTokens(dkfLine);
    const dktTokens = storeTokens(dktLine);
    expect(dkfTokens.length).toBe(dktTokens.length);
    expect(dkfTokens.length).toBe(81); // 83 original - 2 coordinated drops (ɛ, Ɛ)
    // Original trailing padding was 11 "nul" tokens; removing two earlier
    // (non-nul) positions shifts them down but leaves all 11 contiguous at
    // the tail — no INTERIOR nul tokens anywhere else in dkt003b.
    const nulPositions = dktTokens
      .map((t, i) => (t === "nul" ? i : -1))
      .filter((i) => i >= 0);
    expect(nulPositions.length).toBe(11);
    const tailStart = dktTokens.length - nulPositions.length;
    expect(nulPositions).toEqual(
      Array.from({ length: nulPositions.length }, (_, i) => tailStart + i),
    );
    expect(dktLine).not.toContain("U+025B");
    expect(dktLine).not.toContain("U+0190");

    // The two direct K_A rules that produced ɛ/Ɛ are gone.
    expect(kmnText).not.toMatch(/\+\s*\[RALT K_A\]\s*>\s*U\+025[Bb]/);
    expect(kmnText).not.toMatch(/\+\s*\[SHIFT RALT K_A\]\s*>\s*U\+0190/);
    // The base/shift K_A rules survive untouched.
    expect(kmnText).toMatch(/\+\s*\[K_A\]\s*>\s*U\+0061/);
    expect(kmnText).toMatch(/\+\s*\[SHIFT K_A\]\s*>\s*U\+0041/);

    // The four diacritic rules are intact.
    expect(kmnText).toMatch(/\+\s*\[K_LBRKT\]\s*>\s*U\+0301/);
    expect(kmnText).toMatch(/\+\s*\[K_RBRKT\]\s*>\s*U\+0327/);
    expect(kmnText).toMatch(/\+\s*\[K_QUOTE\]\s*>\s*U\+0300/);
    expect(kmnText).toMatch(/\+\s*\[K_BKQUOTE\]\s*>\s*U\+030[Dd]/);
  });

  test("restore ɛ after removal: word contains ɛ/Ɛ again, preview stays healthy", async ({ page }) => {
    await driveToCarveGallery(page);
    await page.getByTestId("carve-card-group#0").click();

    // Remove, then immediately restore via the same chip (now shown "off").
    await page.getByRole("button", { name: "ɛ — K_A", exact: true }).click();
    const removeDialog = page.getByRole("alertdialog");
    await expect(removeDialog).toBeVisible({ timeout: 5_000 });
    await removeDialog.getByRole("button", { name: "Yes, remove everywhere" }).click();
    await expect(removeDialog).toBeHidden();

    await page.getByRole("button", { name: "ɛ — K_A", exact: true }).click();
    const restoreDialog = page.getByRole("alertdialog");
    await expect(restoreDialog).toBeVisible({ timeout: 5_000 });
    const restoreText = await restoreDialog.innerText();
    expect(restoreText).toContain("Restore");
    await restoreDialog.getByRole("button", { name: "Yes, restore everywhere" }).click();
    await expect(restoreDialog).toBeHidden();

    // Preview stays healthy: no error stage, no "blocked from editing".
    await page.waitForTimeout(600); // let the 300ms debounce settle
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("blocked from editing");
    const frame = page.frameLocator('iframe[title="On-screen keyboard preview"]');
    await expect(frame.locator("#default-K_LBRKT .kmw-key-text")).toHaveText(/́/, {
      timeout: 15_000,
    });

    await page.getByTestId("carve-continue").click();
    const { kmnText } = await downloadAndUnzipKmn(page);

    const wordLine = extractStoreLine(kmnText, "word");
    expect(wordLine).toContain("ɛ");
    expect(wordLine).toContain("Ɛ");

    const dkfLine = extractStoreLine(kmnText, "dkf003b");
    const dktLine = extractStoreLine(kmnText, "dkt003b");
    expect(storeTokens(dkfLine).length).toBe(83);
    expect(storeTokens(dktLine).length).toBe(83);
    expect(dktLine).toContain("U+025B");
    expect(dktLine).toContain("U+0190");

    expect(kmnText).toMatch(/\+\s*\[RALT K_A\]\s*>\s*U\+025[Bb]/);
    expect(kmnText).toMatch(/\+\s*\[SHIFT RALT K_A\]\s*>\s*U\+0190/);
  });
});
