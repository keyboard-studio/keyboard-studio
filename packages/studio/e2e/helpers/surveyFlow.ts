/**
 * E2E survey flow helpers — consolidated for spec 034+ walk tests.
 *
 * These helpers drive the authoring workflow from identity selection through
 * emission. Extracted from triplicated copy-paste helpers in carve.spec.ts,
 * copy-edit.spec.ts, and touch-derivation-us1.spec.ts.
 *
 * Updated for spec 036 (glottolog language-identify flow):
 *   - il_language_english is the first question (not il_language_autonym)
 *   - il_language_region is now the second question (new in spec 030 US3)
 *   - il_language_autonym is the third question
 *   - il_language_code is the fourth question
 *   - il_target_script is the fifth question
 */

import { type Page, expect } from "playwright/test";

/**
 * Every phase in the specs that renders SurveyRunner shares one forward
 * control: data-testid="survey-advance". Its accessible name toggles
 * "Next"/"Finish" depending on question position, but the testid is
 * constant — this fixed the bug where role+name "Next" matching missed
 * the final question's "Finish" label and hung for the full 90s timeout.
 */
export function surveyAdvance(page: Page) {
  return page.getByTestId("survey-advance");
}

/**
 * Type free text into an autocomplete combobox (spec 030 identity-lite Q1-Q3/Q4
 * render as `role="combobox"` inputs), then close any suggestion list so the
 * subsequent survey-advance click lands on the button, not a highlighted option.
 * Free text is always accepted by these questions, which keeps the walk
 * deterministic and — for il_language_english — avoids resolving a
 * region-ambiguous langtags entry that would insert il_language_region.
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

/**
 * Drive the identity-lite step to completion (spec 036 language-identify flow).
 *
 * Question order (spec 030 US3, spec 036):
 *   1. il_language_english (autocomplete) — free text
 *   2. il_language_region (optional datalist) — free text or skip
 *   3. il_language_autonym (autocomplete) — free text
 *   4. il_language_code (optional autocomplete) — free text or skip
 *   5. il_target_script (select) — choose a script
 *   6. il_script_not_supported (terminal notice, if CJK/Ethi/Hang)
 *
 * This helper:
 *   - fills English name (arbitrary free text, e.g. "Test")
 *   - skips region (leaves blank — optional field)
 *   - fills autonym (arbitrary free text, e.g. "Test Autonym")
 *   - skips language code (leaves blank — optional field)
 *   - selects target script "other" (keeps routing generic, avoids CJK/Ethiopic/Hangul stub)
 *   - advances through all questions
 *   - waits for the base-keyboard picker combobox to appear (phase boundary)
 */
export async function driveIdentityLite(
  page: Page,
  options?: {
    english?: string;
    autonym?: string;
    script?: string;
  },
): Promise<void> {
  const english = options?.english ?? "Test";
  const autonym = options?.autonym ?? "Test Autonym";
  const script = options?.script ?? "other";

  // Q1: English name (autocomplete) — spec 036 starts here
  await fillComboboxFreeText(page, "#il_language_english", english);
  await surveyAdvance(page).click();

  // Q2: Region (optional datalist) — skip by leaving blank
  await page.waitForSelector("#il_language_region", { timeout: 10_000 });
  await surveyAdvance(page).click();

  // Q3: Autonym (autocomplete) — free text
  await fillComboboxFreeText(page, "#il_language_autonym", autonym);
  await surveyAdvance(page).click();

  // Q4: Language code (optional autocomplete) — skip by leaving blank
  await page.waitForSelector("#il_language_code", { timeout: 10_000 });
  await surveyAdvance(page).click();

  // Q5: Target script (select) — required
  await page.waitForSelector("#il_target_script", { timeout: 10_000 });
  await page.selectOption("#il_target_script", script);
  await surveyAdvance(page).click();

  // Robustness check for the phase boundary: identity-lite hands off
  // to the base keyboard picker. Wait on that landmark rather than trusting
  // the question count above.
  await expect(page.getByRole("combobox", { name: "Base keyboard" })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Resolve the base keyboard via the BaseKeyboardPicker combobox.
 *
 * Two paths:
 *   - Fast: if the keyboard appears as a ranked suggestion card, click it directly.
 *   - Robust: search the full catalog by keyboard ID and select the exact result.
 *
 * @param page Page instance
 * @param keyboardId The keyboard ID to select (e.g. "bj_cree_woods", "basic_kbdfr")
 */
export async function pickBaseKeyboard(
  page: Page,
  keyboardId: string,
): Promise<void> {
  const card = page.getByTestId(`base-card-${keyboardId}`);
  if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Fast path: ranked suggestion card
    await card.click();
    return;
  }

  // Robust path: search by ID in the full catalog
  await page.getByTestId("search-scope-all").click();
  const search = page.getByPlaceholder(/Type to search by name/i);
  await search.fill(keyboardId);
  await page.locator(`[id$="-opt-${keyboardId}"]`).first().click({ timeout: 15_000 });
  const confirm = page.getByTestId("base-confirm");
  await expect(confirm).toBeEnabled({ timeout: 5_000 });
  await confirm.click();
}

/**
 * Choose the "Copy" / "Adapt" track (Track 1) and advance.
 *
 * The track step renders as a survey radio question (track_choice).
 * For Track 1 adapt flow, select the copy/adapt radio option.
 */
export async function chooseAdaptTrack(page: Page): Promise<void> {
  // Track 1 "adapt" option has data-testid="track-adapt"
  await page.getByTestId("track-adapt").check();
  await surveyAdvance(page).click();
}

/**
 * Choose the "Copy" track (Track 1, copy-edit path) and advance.
 *
 * The track step renders as a survey radio question. For the copy-edit variant,
 * select the "Copy" option.
 */
export async function chooseTrackCopy(page: Page): Promise<void> {
  const copyRadio = page.getByRole("radio", { name: /^Copy/i });
  await copyRadio.waitFor({ state: "visible", timeout: 15_000 });
  await copyRadio.check();
  await surveyAdvance(page).click();
}

/**
 * Accept the pre-filled project name and advance through project_name step.
 *
 * The project_name phase has two sub-steps:
 *   1. Display name (pre-filled from identity autonym)
 *   2. Derived keyboard ID (pre-filled from display name)
 *
 * Both are usually pre-filled; we accept as-is.
 */
export async function acceptProjectName(page: Page): Promise<void> {
  const advance = '[data-testid="survey-advance"]';
  await page.waitForSelector(advance, { timeout: 15_000 });
  await expect(page.getByTestId("survey-advance")).not.toBeDisabled({ timeout: 5_000 });
  await page.click(advance); // Step 1: display name

  // Step 2: check if we're on the keyboard-id step (only renders if phase has 2 steps)
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
 *
 * The prefill confirmation screen shows derived values (target script,
 * base keyboard, language). Confirm by clicking the prefill-confirm button.
 */
export async function confirmPrefill(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="prefill-confirm"]', { timeout: 15_000 });
  await page.click('[data-testid="prefill-confirm"]');
}

/**
 * Complete Phase B using the "Add your whole alphabet" method.
 *
 * Flow:
 *   1. IntroChooser — click "Continue" (build-list is default)
 *   2. BuildListView — add one character
 *   3. Click Done
 *
 * @param page Page instance
 * @param charToAdd Character to add (e.g. "é")
 */
export async function buildOneCharacterList(
  page: Page,
  charToAdd: string = "é",
): Promise<void> {
  // IntroChooser — click Continue
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
  await page.click('[data-testid="phase-b-intro-next"]');

  // BuildListView — type a character and add it
  await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
  await page.fill('[aria-label="Character to add"]', charToAdd);
  await page.getByRole("button", { name: "+ Add" }).click();

  // Click Done
  await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', {
    timeout: 5_000,
  });
  await page.click('[data-testid="phase-b-done"]');
}

/**
 * Mechanisms step — handle the empty-diff exit when no new characters
 * remain after base-inventory comparison.
 *
 * MechanismGallery gates its first render behind a one-time intro splash
 * with a "Start the mechanism gallery" button. After dismissing it, if the
 * gallery is in empty-diff state (no new characters), a "No new characters
 * to add." message appears with a "mechanisms-continue" button.
 */
export async function confirmMechanismsEmpty(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  await expect(page.getByText("No new characters to add.")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("mechanisms-continue").click();
}

/**
 * Touch step — skip the single character and reach the all-done state.
 *
 * TouchGallery also has a one-time intro splash ("Start the touch gallery").
 * After dismissing it, skip the single character with a "Skip" button.
 * Once all characters are handled, click "touch-continue".
 */
export async function driveTouchGallery(page: Page): Promise<void> {
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
 * Help (Phase F) step — fill required fields and advance.
 *
 * Phase F has several questions (welcome paragraph, usage tips, credits, contact).
 * This helper:
 *   1. Fills the welcome paragraph
 *   2. Fills the first usage tip
 *   3. Advances through remaining optional questions in a bounded loop
 *   4. Detects arrival at #output (phase boundary)
 *
 * @param page Page instance
 * @param welcomeText Welcome paragraph text (e.g. "Welcome to the keyboard.")
 * @param usageTipText First usage tip (e.g. "Type a consonant, then a vowel.")
 */
export async function driveHelpPhase(
  page: Page,
  welcomeText: string = "Welcome to the keyboard.",
  usageTipText: string = "Press a key to start.",
): Promise<void> {
  await page.locator("#pf_welcome_paragraph").fill(welcomeText);
  await surveyAdvance(page).click();

  await page.locator("#pf_usage_tip_1").fill(usageTipText);

  // Advance through remaining optional questions until we reach #output
  for (let guard = 0; guard < 15; guard++) {
    await surveyAdvance(page).click();
    if (/#output$/.test(page.url())) {
      return;
    }
  }
  throw new Error("driveHelpPhase: did not reach #output within the expected question count");
}

/**
 * Navigate to the Output tab via the nav link and wait for the screen to load.
 */
export async function navigateToOutput(page: Page): Promise<void> {
  await page.click('a[href="#output"]');
  await page.waitForSelector('[data-testid="output-screen-root"]', { timeout: 10_000 });
}

/**
 * Wait for the download button to be enabled and trigger the download.
 *
 * The download button is enabled when the keyboard compile succeeds
 * (stage.kind === "ready"). This is the compile-clean signal for the base
 * keyboard or the scaffolded working copy, depending on the flow path.
 *
 * @param page Page instance
 * @returns Download promise; await .path() to get the file path
 */
export async function triggerDownload(page: Page) {
  const downloadBtn = page.getByTestId("emit-download");
  await expect(downloadBtn).not.toBeDisabled({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadBtn.click(),
  ]);

  return download;
}

/**
 * Complete a full Track 1 walk: identity → base → track(adapt) → project-name
 * → prefill → Phase B → carve (mechanisms empty, touch skipped) → help → output.
 *
 * Used by carve.spec.ts to reach the carve-gallery step.
 */
export async function walkToCarveGallery(
  page: Page,
  baseKeyboardId: string,
  options?: {
    english?: string;
    autonym?: string;
    charToAdd?: string;
  },
): Promise<void> {
  await driveIdentityLite(page, {
    english: options?.english,
    autonym: options?.autonym,
  });
  await pickBaseKeyboard(page, baseKeyboardId);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, options?.charToAdd ?? "é");
}

/**
 * Complete a full Track 1 copy-edit walk: identity → base → track(copy)
 * → project-name → prefill → Phase B → output tab → download.
 *
 * Used by copy-edit.spec.ts and proven-script-walk tests.
 */
export async function walkToDownload(
  page: Page,
  baseKeyboardId: string,
  options?: {
    english?: string;
    autonym?: string;
    charToAdd?: string;
  },
) {
  await driveIdentityLite(page, {
    english: options?.english,
    autonym: options?.autonym,
  });
  await pickBaseKeyboard(page, baseKeyboardId);
  await chooseTrackCopy(page);
  await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, options?.charToAdd ?? "é");
  await navigateToOutput(page);
  return triggerDownload(page);
}
