// E2E: Rule Carver deletion round-trip (spec §11 carve gallery; engine
// pattern-apply/carveFilterIr.ts).
//
// Proves the full AC2 chain for the carve feature: importing a keyboard with
// recognized patterns AND at least one opaque (raw) rule, carving that one
// opaque rule out via the Inspector's two-step confirm, confirming the live
// working-copy IR reflects the deletion via the window.__ksE2E__ hook, then
// confirming the emitted .kmn genuinely omits the deleted rule's distinguishing
// output token.
//
// Fixture: bj_cree_woods (Western Cree, TH-Woods variant — see
// docs/keyboard-index.md). Chosen because its source .kmn contains a raw
// (opaque) fragment at nodeId "rule#93":
//
//   if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)
//
// rule#93 is the ONLY rule in the keyboard that references the C_efc store,
// so its distinguishing token in the emitted .kmn is "index(C_efc,3)" —
// present when the rule is kept, absent once it is carved out.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test carve.spec.ts
//
// Requires `pnpm install` to have linked the `fflate` devDependency added to
// packages/studio/package.json alongside this spec (see report — reused at
// the same pinned version already vetted for @keyboard-studio/engine's own
// zip writer, not a new library introduction).

import { test, expect, type Page } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import type { KeyboardIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bj_cree_woods";
const TARGET_NODE_ID = "rule#93";
// Present in the emitted .kmn iff rule#93 (the sole index(C_efc,...) user) survives.
const KEPT_ONLY_TOKEN = "index(C_efc,3)";
const KMN_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.kmn`;

// ---------------------------------------------------------------------------
// window.__ksE2E__ typing — mirrors packages/studio/src/lib/e2eHook.ts.
// Declared locally (not imported) so this spec has no compile-time coupling
// to studio's src/ internals beyond the documented window contract.
// ---------------------------------------------------------------------------

interface KsE2EHook {
  getWorkingIr(): KeyboardIR | null;
  getDeletedNodeIds(): string[];
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

// ---------------------------------------------------------------------------
// Page-object-lite helpers
// ---------------------------------------------------------------------------

/**
 * Every phase in this spec that renders SurveyRunner shares one forward
 * control: data-testid="survey-advance". Its accessible name toggles
 * "Next"/"Finish" depending on question position, but the testid is
 * constant — this is the fix for the bug this spec previously carried,
 * where role+name "Next" matching missed the final question's "Finish"
 * label and hung for the full 90s timeout.
 */
function surveyAdvance(page: Page) {
  return page.getByTestId("survey-advance");
}

/**
 * Drive the identity-lite (Phase A "il_*") mini-flow to completion.
 * il_language_code is left blank (required: false) — the survey advances on
 * a blank optional field. il_target_script is set to "other" so Canadian
 * Aboriginal Syllabics (not in the v1 script enum) does not accidentally
 * route into the §9 unsupported-script stub reserved for Ethi/Hani/Hang.
 */
async function driveIdentityLite(page: Page): Promise<void> {
  await page.locator("#il_language_autonym").fill("Nehiyawewin");
  await surveyAdvance(page).click();

  // il_language_english is seeded from the autonym by IdentityLite's
  // getSeedValue; required, but already non-empty — just advance.
  await expect(page.locator("#il_language_english")).not.toHaveValue("");
  await surveyAdvance(page).click();

  // il_language_code — optional, left blank.
  await surveyAdvance(page).click();

  // il_target_script — required select. "other" keeps routing generic and
  // avoids the CJK/Ethiopic/Hangul §9 stub gate. This is the last
  // identity-lite question, so the button reads "Finish" here — same
  // testid, so no branching needed.
  await page.locator("#il_target_script").selectOption("other");
  await surveyAdvance(page).click();

  // Robustness check for the phase boundary itself: identity-lite hands off
  // to the base keyboard picker. Wait on that landmark rather than trusting
  // the fixed 4-click count above to stay in sync with il_*.yaml.
  await expect(page.getByRole("combobox", { name: "Base keyboard" })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Resolve the base keyboard via the BaseKeyboardPicker combobox (the "pick
 * any base by id" path — the ranked-suggestion cards are not guaranteed to
 * surface a Canadian-syllabics keyboard for an "other"-script target).
 */
async function pickBaseKeyboard(page: Page, keyboardId: string): Promise<void> {
  const combobox = page.getByRole("combobox", { name: "Base keyboard" });
  await combobox.click();
  await combobox.fill(keyboardId);

  const option = page.getByRole("option", { name: new RegExp(keyboardId) }).first();
  await option.click();

  await page.getByTestId("base-confirm").click();
}

/**
 * track step — PhaseTrack renders a single-question SurveyRunner flow
 * (track_choice). data-testid="track-adapt" is the live RadioGroup option
 * (RadioGroup.tsx wires the testid only onto the track_choice-adapt input);
 * the old "track-adapt"/"track-next" pair on the retired
 * editors/panels/TrackStep.tsx no longer applies — that component is not
 * rendered by SurveyView.
 */
async function chooseAdaptTrack(page: Page): Promise<void> {
  await page.getByTestId("track-adapt").check();
  await surveyAdvance(page).click();
}

/** characters step, prefill sub-stage — a static confirmation, no inputs. */
async function confirmPrefill(page: Page): Promise<void> {
  // Prefill.tsx is a standalone confirmation screen, not a SurveyRunner
  // instance — no survey-advance testid reaches it, so role+text matching
  // stays here (flagged for km-frontend below).
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}

/**
 * characters step, Phase B sub-stage — build-list discovery method (the
 * IntroChooser default). Adds exactly one character that the base keyboard
 * ALREADY produces via an unconditional TYPED rule, so that
 * useInventoryDiff() resolves lettersToAdd to empty and the downstream
 * Mechanism/Touch galleries take their empty-diff "nothing to do" exits
 * rather than requiring a full per-character assignment walk.
 *
 * U+166E ("᙮", CANADIAN SYLLABICS FULL STOP) is produced by
 * bj_cree_woods.kmn's `+ "." > U+166E` rule — a plain `{kind:"char"}`
 * output with no if/index/deadkey conditioning, so buildProducedSet (which
 * only walks typed ir.groups[].rules[].output, never ir.raw) captures it
 * directly. This is deliberately NOT a character produced only via the
 * opaque rule#93 (e.g. U+140C, a member of store C_efc emitted solely by
 * rule#93's index(C_efc,3) output) — buildProducedSet cannot see into
 * ir.raw, so such a character would show as still-missing ("0 of 1 added")
 * regardless of the carve decision, defeating the empty-diff pass-through
 * this helper exists to set up.
 */
async function buildOneCharacterList(page: Page): Promise<void> {
  // IntroChooser ("Continue") and the build-list add/done controls are a
  // standalone Phase B sub-view, not a SurveyRunner instance — no testid
  // reaches them, so role+text matching stays here (flagged for
  // km-frontend below).
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Character to add").fill("᙮");
  await page.getByRole("button", { name: "+ Add" }).click();

  await page.getByRole("button", { name: /^Done \(1 character\)$/ }).click();
}

/**
 * mechanisms step — expected to resolve immediately to the empty-diff exit
 * ("No new characters to add." + data-testid="mechanisms-continue") given
 * buildOneCharacterList() pre-empted every letter via the produced-set
 * trick. The testid is constant across MechanismGallery's several exit
 * states (empty-diff, all-keys-added, locked-escape), so this helper does
 * not need to branch on which one rendered.
 *
 * MechanismGallery gates its first render behind a one-time intro splash
 * (showIntro, seeded from galleryIntrosSeen.mechanism — MechanismGallery.tsx)
 * with a "Start the mechanism gallery" button; the empty-diff message only
 * appears after it is dismissed. Same GalleryIntroSplash component and same
 * conditional-click pattern as driveTouchGallery's "Start the touch
 * gallery" button below — no data-testid exists on either intro button yet
 * (IntroSplash.tsx sets aria-label={startAriaLabel}, not a testid; flagged
 * for km-frontend), so role+name matching stays here to unblock now.
 */
async function confirmMechanismsEmpty(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  await expect(page.getByText("No new characters to add.")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("mechanisms-continue").click();
}

/**
 * touch step — same one-character inventory as Phase B (TouchGallery reads
 * the raw confirmedInventory, not the base-diffed lettersToAdd). Dismiss the
 * one-time intro splash, then Skip the single character to reach the
 * all-done state, whose forward control is data-testid="touch-continue".
 */
async function driveTouchGallery(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  const skipButton = page.getByRole("button", { name: /^Skip / });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }

  await page.getByTestId("touch-continue").click();
}

/**
 * help (Phase F) step — fill the two required fields, then click
 * survey-advance in a bounded loop until PhaseF hands off to Output
 * (there is no "package" screen between help and output — see spec §11
 * output path). Detecting the #output URL rather than counting clicks
 * keeps this driver correct if phase_f_helpdocs.yaml gains or loses
 * optional tips/credits/contact questions.
 */
async function driveHelpPhase(page: Page): Promise<void> {
  await page.locator("#pf_welcome_paragraph").fill("Welcome to the Western Cree keyboard.");
  await surveyAdvance(page).click();

  await page.locator("#pf_usage_tip_1").fill("Press a consonant key, then a vowel key.");

  // Advance through the remaining optional tips/credits/contact questions —
  // survey-advance is the single control for both "Next" and the final
  // question's "Finish" label, and the last click navigates straight to
  // #output (no intermediate package/summary screen).
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

test.describe("Rule Carver — carve one opaque rule, verify IR + emitted .kmn", () => {
  test("deleting rule#93 in the carve gallery removes it from the deleted-node IR state and from the emitted .kmn", async ({ page }) => {
    // ?e2e=1 is the runtime override for installE2eHook() (src/lib/e2eHook.ts)
    // — no VITE_E2E build flag needed.
    await page.goto("/?e2e=1");

    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page);

    // Manifest spine order (StudioShell.tsx) is characters -> carve ->
    // mechanisms -> touch -> help; carve comes immediately after Phase B,
    // BEFORE mechanisms/touch.

    // ---------------------------------------------------------------------
    // Carve gallery
    // ---------------------------------------------------------------------
    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    const targetCard = page.getByTestId(`carve-card-${TARGET_NODE_ID}`);
    await expect(targetCard).toBeVisible();
    await expect(targetCard).toHaveAttribute("data-kind", "raw");
    await targetCard.click();

    await page.getByTestId("raw-remove-anyway").click();
    await page.getByTestId("raw-confirm-remove").click();

    // ---------------------------------------------------------------------
    // AC2 checkpoint 1: the IR reflects the deletion.
    //
    // getWorkingIr().raw still LISTS rule#93 — the raw array is filtered at
    // emit time by carveFilterIr, not mutated in place. The deletion is
    // recorded in the deletedNodeIds overlay, which is what this asserts.
    // ---------------------------------------------------------------------
    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedNodeIds() ?? []),
        { timeout: 5_000 },
      )
      .toContain(TARGET_NODE_ID);

    const workingIr = await page.evaluate(() => window.__ksE2E__?.getWorkingIr() ?? null);
    expect(workingIr).not.toBeNull();
    expect(workingIr?.raw.some((frag) => frag.nodeId === TARGET_NODE_ID)).toBe(true);

    await page.getByTestId("carve-continue").click();

    // ---------------------------------------------------------------------
    // Remaining spine steps: mechanisms, touch, help.
    // ---------------------------------------------------------------------
    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    // handlePhaseFComplete navigates to #output.
    await page.waitForURL(/#output$/);

    // ---------------------------------------------------------------------
    // AC2 checkpoint 2: the emitted .kmn omits the deleted rule.
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

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).not.toContain(KEPT_ONLY_TOKEN);
  });

  // Positive control — same walk, but the opaque rule is left in place, so
  // the emitted .kmn MUST contain the token. This is the guard that proves
  // the primary test's negative assertion is actually exercising the carve
  // path rather than passing because the token was never emitted at all
  // (e.g. a scaffold/base-resolution regression that silently drops raw
  // fragments before the carve step even runs).
  test("control: keeping rule#93 leaves its distinguishing token in the emitted .kmn", async ({ page }) => {
    await page.goto("/?e2e=1");

    await driveIdentityLite(page);
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page);

    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    // Select the card to confirm it is present and raw-kind, but do NOT
    // remove it — this is the "nothing carved" control path.
    const targetCard = page.getByTestId(`carve-card-${TARGET_NODE_ID}`);
    await expect(targetCard).toBeVisible();
    await expect(targetCard).toHaveAttribute("data-kind", "raw");

    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedNodeIds() ?? []),
        { timeout: 5_000 },
      )
      .not.toContain(TARGET_NODE_ID);

    await page.getByTestId("carve-continue").click();

    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    await page.waitForURL(/#output$/);

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

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).toContain(KEPT_ONLY_TOKEN);
  });
});
