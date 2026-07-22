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
 * Seed the durable "returning visitor" flag (`ks.visited` in localStorage,
 * see src/lib/firstVisit.ts) BEFORE the page's first script runs, so
 * StudioShell's first-visit gate (defaultLandingRoute() in StudioShell.tsx)
 * skips WelcomeScreen and lands directly on the default route (the survey)
 * for a fresh Playwright browser context — which always starts with empty
 * localStorage and would otherwise be treated as a genuine first-time
 * visitor on every test.
 *
 * MUST be called before `page.goto(...)` (it uses addInitScript, which only
 * takes effect on documents created after it is registered) — it cannot live
 * inside driveIdentityLite, which runs post-goto.
 *
 * This is draft-safe: it only sets the visited flag, unlike clicking
 * WelcomeScreen's "I'm new" button, which additionally clears any resumable
 * draft (see WelcomeScreen.tsx). Explicit navigation to `#welcome` still
 * reaches the WelcomeScreen afterward — StudioShell's router honors an
 * explicit `#welcome` hash for returning visitors; the gate only forces the
 * redirect for genuine first-timers.
 */
export async function seedReturningVisitor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ks.visited", "1");
    } catch {
      // Quota / private-mode — the welcome-gate fallback is harmless here too.
    }
  });
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
 * Poll for an optional/conditional question's field to appear within a short
 * window, without blocking the whole helper if it never shows up. Used for
 * identity-lite questions that IdentityLite's `getNextOverride` may skip
 * entirely (see `driveIdentityLite`).
 */
async function isConditionalQuestionPresent(
  page: Page,
  selector: string,
  timeout = 2_000,
): Promise<boolean> {
  return page
    .waitForSelector(selector, { timeout, state: "visible" })
    .then(() => true)
    .catch(() => false);
}

/**
 * Drive the identity-lite step to completion (spec 036 language-identify flow).
 *
 * Question order (spec 030 US3, spec 036):
 *   1. il_language_english (autocomplete) — free text
 *   2. il_language_region (CONDITIONAL datalist) — only inserted by
 *      IdentityLite's getNextOverride when the resolved langtags entry for
 *      the English name is region-ambiguous (hasRegionVariants). The
 *      deterministic free-text fixtures used by these specs never resolve to
 *      a langtags entry, so this question is normally ABSENT and the flow
 *      advances straight to il_language_autonym.
 *   3. il_language_autonym (autocomplete) — free text, always present
 *   4. il_language_code (optional-VALUE autocomplete) — always rendered
 *      (its `next` is static, unconditional); the value itself may be left
 *      blank.
 *   5. il_target_script (select) — choose a script
 *   6. il_script_not_supported (terminal notice, if CJK/Ethi/Hang)
 *
 * This helper detects presence rather than assuming the fixed sequence above,
 * since il_language_region is conditional and may not render at all:
 *   - fills English name (arbitrary free text, e.g. "Test")
 *   - if region shows up within a short poll, advances past it (leaves blank);
 *     otherwise proceeds directly (it was skipped)
 *   - fills autonym (arbitrary free text, e.g. "Test Autonym") — waited for
 *     directly, since it is reliably the next field either way
 *   - il_language_code is always rendered (unconditional `next`); advances
 *     past it leaving it blank
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

  // Q2: Region — CONDITIONAL. Only present when the English name resolved to
  // a region-ambiguous langtags entry (see IdentityLite.getNextOverride).
  // Detect presence with a short poll instead of assuming it always renders.
  if (await isConditionalQuestionPresent(page, "#il_language_region")) {
    await surveyAdvance(page).click();
  }

  // Q3: Autonym (autocomplete) — always present; free text
  await fillComboboxFreeText(page, "#il_language_autonym", autonym);
  await surveyAdvance(page).click();

  // Q4: Language code — ALWAYS rendered (its `next` is static/unconditional;
  // only the VALUE is optional). Interact with it unconditionally — a
  // short-timeout presence poll here would misread a slow cold-server render
  // (>2s) as "absent," silently skip the advance click, and desync the walk
  // by one question instead of failing loudly. Wait with the same timeout
  // used elsewhere and leave the field blank (the value is optional).
  await page.waitForSelector("#il_language_code", { timeout: 15_000 });
  await surveyAdvance(page).click();

  // Q5: Target script (select) — required
  await page.waitForSelector("#il_target_script", { timeout: 10_000 });
  await page.selectOption("#il_target_script", script);
  await surveyAdvance(page).click();

  // Robustness check for the phase boundary: identity-lite hands off
  // to the base keyboard picker. Wait on that landmark rather than trusting
  // the question count above. BaseResolution.tsx renders its root with
  // data-testid="base-picker" (the visible field inside is a "Search
  // keyboards" labeled input, not a role=combobox named "Base keyboard").
  await expect(page.getByTestId("base-picker")).toBeVisible({
    // Cold-start guard: the base picker enumerates the entire ../keyboards
    // clone from disk on first render, which can take well over 20s on a cold
    // dev server. This wait is the single cold-start margin for every walk
    // spec (all pass through driveIdentityLite before pickBaseKeyboard), so it
    // stays at 90s rather than the 15s used for warm intra-survey transitions.
    timeout: 90_000,
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

  // The marks series (spec 046) sits immediately after alphabet confirmation,
  // BEFORE carve — a mark-bearing charToAdd (e.g. "é") makes it render here.
  // A marks-free alphabet auto-skips it (S0 gate) and this is a no-op.
  await driveMarksSeries(page);
}

/**
 * Marks series step (spec 046) — sits between characters and carve (the
 * combined-letter answers must be known before any key work begins).
 *
 * Its S0 gate is computed, never rendered: an alphabet with NO marks skips
 * the whole series (no screen appears — this helper returns immediately).
 * When the alphabet carries marks (e.g. buildOneCharacterList(page, "é")),
 * stations S1-S5 render in sequence, everything prefilled propose-then-confirm;
 * each click of data-testid="marks-continue" accepts the current station's
 * proposal and advances, and the last one completes the step. The station
 * count varies with the alphabet (at most 5, SC-006), so this loops rather
 * than assuming a fixed count.
 */
export async function driveMarksSeries(page: Page): Promise<void> {
  const continueBtn = page.getByTestId("marks-continue");
  for (let i = 0; i < 6; i++) {
    const visible = await continueBtn
      .isVisible({ timeout: i === 0 ? 5_000 : 2_000 })
      .catch(() => false);
    if (!visible) return; // gate skipped the series, or it just completed
    await continueBtn.click();
  }
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
  // The marks series (spec 046) now runs before carve and is driven inside
  // buildOneCharacterList — nothing marks-related can render here.
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  await expect(page.getByText("No new characters to add.")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("mechanisms-continue").click();
}

/**
 * Touch step — first resolve the touch-layout starting point (seed source),
 * then configure a touch mechanism for every character in the inventory.
 *
 * Ahead of the per-character TouchGallery walk, TouchSeedSourcePanel.tsx
 * asks the author to pick a touch-layout starting point ("Import & adapt"
 * vs "Reseed from desktop" — data-testid="seed-source-import-adapt" /
 * "seed-source-reseed") and click data-testid="seed-source-confirm". This
 * helper accepts whichever option the panel defaults to (import-adapt when
 * the base ships a usable touch layout, else reseed-from-desktop — see
 * TouchSeedSourcePanel's `selected` default) rather than forcing a specific
 * choice; callers that need the explicit reseed path use their own wrapper.
 *
 * TouchGallery walks the WHOLE inventory (not just the one newly added in
 * Phase B; MechanismGallery's new-characters-only diff does not apply here).
 * "Skip this character" is pure navigation and records nothing — it does
 * NOT bypass the FR-008 completion gate (handleContinue in TouchGallery.tsx
 * refuses to complete while any inventory character has no reachable touch
 * mechanism), so skipping the final character alone hangs on an inline
 * "Cannot finish yet" gate forever. Instead this helper actually configures
 * the default "Long-press on a key" method (host key select, aria-label
 * "Host key for long-press") + Apply for every character, then advances via
 * "touch-continue" (which doubles as "Next character"/"Done").
 *
 * It also has a one-time intro splash ("Start the touch gallery"), dismissed
 * first.
 */
export async function driveTouchGallery(page: Page): Promise<void> {
  const seedConfirm = page.getByTestId("seed-source-confirm");
  if (await seedConfirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await seedConfirm.click();
  }

  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }

  const continueButton = page.getByTestId("touch-continue");
  const hostKeySelect = page.getByRole("combobox", { name: "Host key for long-press" });
  const applyButton = page.getByRole("button", { name: /^Apply touch method for/ });

  for (let guard = 0; guard < 200; guard++) {
    const stillPresent = await continueButton.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!stillPresent) return;

    // canGoNext (gates continueButton) requires the character to already be
    // configured; a fresh character always starts disabled (method/hostKey
    // reset on every currentChar change), so a disabled continueButton means
    // this character still needs the default long-press method + Apply.
    if (await continueButton.isDisabled()) {
      await hostKeySelect.selectOption({ label: "K_A (A)" });
      await applyButton.click();
    }
    await continueButton.click();
  }
  throw new Error("driveTouchGallery: did not complete within the expected character count");
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
