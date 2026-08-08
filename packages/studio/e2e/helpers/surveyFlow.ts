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

import { type Locator, type Page, expect } from "playwright/test";

/**
 * Open a `ui/SelectMenu` and click one option by its underlying value.
 *
 * Native `<select>` popups do not open in the VS Code webview, so these fields
 * are a button + a DOM-rendered `<ul role="listbox">`. The list is
 * **portalled to `document.body`** (SelectMenu.tsx: an ancestor with
 * `overflow: hidden` would otherwise clip it), so it is NOT a descendant of
 * the trigger — an `xpath=..`-scoped option query can never find it, and hangs
 * until the test's own timeout with no clue as to why.
 *
 * Scoped to the OPEN listbox at page level, which is the only place the
 * options actually live.
 */
export async function selectMenuOption(
  page: Page,
  trigger: Locator,
  value: string,
): Promise<void> {
  await trigger.waitFor({ timeout: 15_000 });
  await trigger.click();
  await page.locator(`ul[role="listbox"] li[data-value="${value}"]`).click({ timeout: 15_000 });
}

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
 * WelcomeScreen's "Continue as guest" button, which additionally clears any resumable
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
 * Locator equivalent of {@link isConditionalQuestionPresent}: waits UP TO
 * `timeout` for `locator` to become visible, resolving `true`/`false` rather
 * than throwing. Deliberately NOT `locator.isVisible({timeout})` — Playwright
 * deprecated and ignores that option (isVisible always reads the CURRENT DOM
 * state with no wait at all), which is exactly the kind of false "it's not
 * there" read that made driveConvenienceStep race against a late render (see
 * that helper's doc comment). Every presence check in this module that needs
 * to survive a genuine render/recompute delay should use this, not
 * `.isVisible({timeout})`.
 */
async function waitVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Drive the identity-lite step to completion (spec 036 language-identify flow).
 *
 * Question order (spec 030 US3, spec 036, spec 059 US1):
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
 *   6. il_script_not_supported (terminal notice, if CJK/Ethi/Hang) — never
 *      reached by this helper, since it always picks the "other" script.
 *   7. il_author_name (text) — REQUIRED (validate() rejects blank); reached
 *      unconditionally for every supported script (il_target_script's
 *      `next` default-branches here — see il_target_script.ts). Unseeded in
 *      an unauthenticated e2e run (IdentityLiteAdapter's authorSeed comes
 *      from useGitHubAuth(), which returns no name/email for a guest), so
 *      this helper must type a value or the walk parks here forever.
 *   8. il_author_email (text) — optional (required: false; a private GitHub
 *      email must never block emission per spec 059).
 *   9. il_copyright_holder (text) — optional and TERMINAL (`next: null`);
 *      blank defaults to the author name (D1).
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
 *   - fills il_author_name (required) and advances past the optional
 *     il_author_email / il_copyright_holder leaving both blank
 *   - waits for the base-keyboard picker combobox to appear (phase boundary)
 */
export async function driveIdentityLite(
  page: Page,
  options?: {
    english?: string;
    autonym?: string;
    script?: string;
    /**
     * ISO 639 language subtag to type at `il_language_code`. OMIT to leave the
     * field blank, which is the default every existing walk relies on.
     *
     * Supply it when the walk needs a real composed BCP47 tag downstream — the
     * package descriptor's declared language is the case this exists for (spec
     * 057 FR-001): with the code blank the composed tag is empty and the
     * descriptor falls back to its `und` placeholder, which cannot distinguish
     * "the author's tag" from "no tag".
     */
    languageCode?: string;
    /**
     * Author name for il_author_name (spec 059 US1) — REQUIRED, unlike every
     * other option here. OMIT to use the default; every existing walk relies
     * on that default rather than passing this explicitly.
     */
    authorName?: string;
  },
): Promise<void> {
  const english = options?.english ?? "Test";
  const autonym = options?.autonym ?? "Test Autonym";
  const script = options?.script ?? "other";
  const languageCode = options?.languageCode;
  const authorName = options?.authorName ?? "Test Author";

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
  if (languageCode !== undefined) {
    // Same autocomplete control as il_language_english/il_language_autonym:
    // typing a real code like "fr" opens a suggestion listbox, and a stray
    // option (e.g. "Arpitan — France (frp)") sitting over the Next button
    // would otherwise intercept the click below. fillComboboxFreeText fills
    // the value and presses Escape to dismiss the listbox without clearing it.
    await fillComboboxFreeText(page, "#il_language_code", languageCode);
  }
  await surveyAdvance(page).click();

  // Q5: Target script (select) — required. A ui/SelectMenu, not a native
  // <select>; see selectMenuOption above for why the option cannot be reached
  // through the trigger's parent.
  await selectMenuOption(page, page.locator("#il_target_script"), script);
  await surveyAdvance(page).click();


  // Q6: Author name (plain text field) — ALWAYS rendered for every supported
  // script (il_target_script's default branch goes here unconditionally; only
  // the gated CJK/Ethiopic/Hangul scripts skip straight to
  // il_script_not_supported instead, which this helper never selects) AND
  // REQUIRED (validate() rejects blank — see
  // questions/reserve/author_display_name.ts, reused by il_author_name.ts).
  // Unseeded here: IdentityLiteAdapter's authorSeed comes from
  // useGitHubAuth(), which returns no name/email for an unauthenticated e2e
  // run, so this field starts genuinely blank.
  await page.waitForSelector("#il_author_name", { timeout: 15_000 });
  await page.locator("#il_author_name").fill(authorName);
  await surveyAdvance(page).click();

  // Q7: Author email (plain text field) — always rendered, but optional
  // (required: false; a private GitHub profile email must never block
  // emission per spec 059). Left blank (private-email authors are a real,
  // supported case per D7).
  await page.waitForSelector("#il_author_email", { timeout: 15_000 });
  await surveyAdvance(page).click();

  // Q8: Copyright holder — optional, TERMINAL (`next: null`); left blank
  // (D1 defaults it to the author name). This hands off to the base picker.
  await page.waitForSelector("#il_copyright_holder", { timeout: 15_000 });
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
    // Fast path: ranked suggestion card. Clicking the card SELECTS it — the
    // step still has to be confirmed, exactly as on the search path below.
    // (Specs whose base is not a ranked suggestion never exercise this branch,
    // which is why the missing confirm went unnoticed: the walk simply parked
    // on the picker until the test timed out.)
    await card.click();
    const cardConfirm = page.getByTestId("base-confirm");
    if (await cardConfirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(cardConfirm).toBeEnabled({ timeout: 5_000 });
      await cardConfirm.click();
    }
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

  // The punctuation page sits between marks and convenience. It has no skip
  // gate (zero punctuation is a valid answer), so it always renders — the
  // walks accept it empty.
  await drivePunctuationStep(page);

  // The convenience question sits between punctuation and carve. A
  // one-character alphabet on a Latin base leaves almost all of a-z surplus,
  // so this one DOES render on the standard walks.
  await driveConvenienceStep(page);
}

/**
 * Punctuation step — the Phase-B-build-list clone between the marks series
 * and the convenience question, collecting the language's punctuation with a
 * right-pane character map. It has no computed skip gate: the walks simply
 * continue without choosing any punctuation ("Continue without punctuation").
 */
export async function drivePunctuationStep(page: Page): Promise<void> {
  const doneBtn = page.getByTestId("punctuation-done");
  const visible = await doneBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!visible) return;
  await doneBtn.click();
}

/**
 * Convenience-letters step — sits between the marks series and carve: which
 * basic-Latin letters the orthography does not use should be kept anyway, for
 * borrowed words, email addresses, and web addresses.
 *
 * Like the marks series, its gate is computed and never rendered: a base with
 * no surplus basic-Latin letters (or an unconfirmed alphabet) skips the step
 * entirely and this helper returns immediately. When it does render every
 * letter is pre-checked, so clicking Continue accepts the proposal — which is
 * what the walks want, since a kept letter is simply shielded from carve's
 * removal recommendations rather than changing the flow.
 *
 * Race-proof by construction (spec 057 Class-B diagnosis — see
 * specs/057-bulletproof-navigation/reviews/classB-diagnosis.md): the gate is
 * COMPUTED from a recompute that can legitimately land several seconds after
 * this helper starts polling (observed live: right after a mid-walk tab round
 * trip stresses the same recompute). A short "not visible yet" read is proof
 * only that the screen hasn't rendered YET, not that the gate skipped it —
 * treating the two as the same thing is what let the walk return early while
 * the app was still sitting on "Keep these letters for convenience?", timing
 * out downstream on the NEXT landmark it never reached. Races the step's own
 * control against the one landmark that ALWAYS follows it on the spine
 * (carve — see steps/manifest.ts), and only clicks Continue if the
 * convenience screen is the one that actually showed.
 */
export async function driveConvenienceStep(page: Page): Promise<void> {
  const continueBtn = page.getByTestId("convenience-continue");
  const carveGallery = page.getByTestId("carve-gallery");
  await Promise.race([
    continueBtn.waitFor({ state: "visible", timeout: 20_000 }),
    carveGallery.waitFor({ state: "visible", timeout: 20_000 }),
  ]).catch(() => {
    // Neither landmark showed within the combined window — fall through to
    // the direct check below, which reports the real state; a genuinely
    // stuck walk still fails loudly at the caller's own subsequent wait.
  });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click();
  }
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
 *
 * Race-proof by construction — the same hardening as driveConvenienceStep
 * above (see its doc comment): races the step's own control against the
 * landmarks that follow it on the spine (the convenience step's control, or —
 * if that is ALSO gated away — the carve gallery itself), rather than trusting
 * a fixed-timeout absence read to mean "the S0 gate skipped this".
 */
export async function driveMarksSeries(page: Page): Promise<void> {
  const continueBtn = page.getByTestId("marks-continue");
  const nextLandmarks = [
    page.getByTestId("convenience-continue"),
    page.getByTestId("carve-gallery"),
  ];
  for (let i = 0; i < 6; i++) {
    const timeout = i === 0 ? 20_000 : 5_000;
    await Promise.race([
      continueBtn.waitFor({ state: "visible", timeout }),
      ...nextLandmarks.map((l) => l.waitFor({ state: "visible", timeout })),
    ]).catch(() => {
      // Nothing showed within the combined window — fall through to the
      // direct visibility check below.
    });
    if (!(await continueBtn.isVisible().catch(() => false))) return; // skipped, or just completed
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
 * Mechanism Gallery (Phase C) — walks EVERY character in the gallery's
 * lettersToAdd worklist to completion, however many it holds.
 *
 * Before spec 046/#1411 landed, a Phase B build-list walk placing ONE new
 * letter (e.g. "é") meant exactly one character to configure here, and the
 * per-spec `driveMechanismsPlaceLetter` helpers (now retired — see
 * specs/057-bulletproof-navigation/reviews/classB-diagnosis.md) could name it
 * directly and click its "Apply method for é" button. That assumption no
 * longer holds: an accepted marks-series proposal (spec 046) puts the
 * DECOMPOSED combining mark into this same worklist alongside the letter, and
 * the case-pair uppercase companion (#1411) adds the uppercase counterpart
 * too — a one-character placement can now widen to a 3-character walk here,
 * and the FIRST uncovered character in collation order need not be the one
 * the spec fixture named. Hard-coding "click Apply for THIS char" against
 * that widened, reordered list is what hung (evidence: touch-derivation-us2's
 * AS4 test waited 240s for "Apply method for é" because the gallery opened on
 * the combining mark instead).
 *
 * This driver instead walks whatever is actually there:
 *   - dismisses the one-time intro splash ("Start the mechanism gallery"),
 *   - handles the empty-diff exit ("No new characters to add.") — a
 *     marks-free alphabet on a base that already produces everything added
 *     leaves nothing to place here at all, and this is a clean no-op for that
 *     case (mirrors confirmMechanismsEmpty's shape above);
 *   - otherwise, for each character in turn: if the generic "Apply method for
 *     X" button is already enabled (the §3c decomposable-accented deadkey
 *     default is Apply-ready with zero field edits, and so — for the SAME
 *     reason — is its uppercase counterpart), click it directly; otherwise
 *     (e.g. a bare combining mark, whose default "Assign to a key" method
 *     starts with no physical key chosen, so Apply starts disabled) falls
 *     back to "Type a sequence" with a synthetic, per-character-unique
 *     (content, indicator) pair. A sequence-only mechanism satisfies the same
 *     coverage gate a real key assignment would (hasSequenceForChar /
 *     uncoveredTargets both count it — see MechanismGallery.tsx's canGoNext
 *     and lib/unimplementedInventory.ts) without ever colliding with a real
 *     physical-key rule the base keyboard, or an earlier iteration of this
 *     same loop, already owns — the synthetic content string embeds the
 *     character's own codepoint, so no two iterations can ever share a
 *     (content, indicator) pair.
 *   - advances via "Next character"/"Done" until the gallery completes.
 *
 * Does not name or return which character was which — callers that need to
 * prove a SPECIFIC placed letter landed correctly do so from the emitted
 * output (the .kmn/.keyman-touch-layout ZIP contents), not from an assertion
 * made mid-gallery.
 */
export async function driveMechanismsGallery(page: Page): Promise<void> {
  // NOTE: Locator.isVisible()'s `timeout` option is deprecated/ignored by
  // Playwright — it never actually waits, only reads the CURRENT DOM state.
  // Every presence check below that needs to survive a real render/recompute
  // delay uses waitFor({state:"visible", timeout}) instead (see waitVisible),
  // the same mistake driveConvenienceStep's race fix exists to correct.
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await waitVisible(startButton, 5_000)) {
    await startButton.click();
  }

  // Empty-diff exit vs. the ordinary per-character walk: race the two
  // possible landmarks with a generous combined window, rather than checking
  // one first and treating its absence as proof the other applies (a check
  // that doesn't itself wait can't tell "not rendered yet" from "never
  // will" — see waitVisible's doc comment). Either the empty-diff notice or
  // the per-character forward button becoming visible resolves the race;
  // then read which one is ACTUALLY present.
  const emptyNotice = page.getByText("No new characters to add.");
  const forwardButton = page.getByRole("button", { name: /^(Next character|Done)$/ });
  const applyButton = page.getByRole("button", { name: /^Apply method for / });
  await Promise.race([
    waitVisible(emptyNotice, 15_000),
    waitVisible(forwardButton, 15_000),
  ]);
  if (await waitVisible(emptyNotice, 500)) {
    await page.getByTestId("mechanisms-continue").click();
    return;
  }

  for (let guard = 0; guard < 50; guard++) {
    const stillPresent = await waitVisible(forwardButton, 8_000);
    if (!stillPresent) return; // the gallery has completed (onComplete fired)

    if (await waitVisible(applyButton, 2_000)) {
      if (!(await applyButton.isDisabled())) {
        await applyButton.click();
      } else {
        // The default method isn't Apply-ready (e.g. a bare combining mark's
        // "Assign to a key" default has no physical key chosen yet) — fall
        // back to "Type a sequence" with a synthetic, collision-free pair.
        const ariaLabel = (await applyButton.getAttribute("aria-label")) ?? "";
        const currentChar = ariaLabel.replace(/^Apply method for /, "");
        const contentToken =
          "zzq" +
          [...currentChar]
            .map((cp) => (cp.codePointAt(0) ?? 0).toString(16))
            .join("");

        await page.getByRole("button", { name: "Type a sequence" }).click();
        await page.getByTestId("sequences-content").fill(contentToken);
        await page.getByTestId("sequences-indicator").fill("j");
        await page.getByTestId("sequences-apply").click();
      }
    }

    await forwardButton.click();
  }
  throw new Error(
    "driveMechanismsGallery: did not complete within the expected character count",
  );
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
 *
 * Now load-bearing for a widened worklist (spec 057 Class-B diagnosis — see
 * specs/057-bulletproof-navigation/reviews/classB-diagnosis.md): a desktop
 * MechanismAssignment on ANY character (not just the one letter a spec
 * fixture names) makes that character a `desktopSuggestionTargets` entry and
 * therefore a touch-gallery walk stop (TouchGallery.tsx's `touchLettersToAdd`).
 * This driver already walks however many stops there are — unlike the
 * retired per-spec `driveTouchGalleryAcceptPlacement` helpers, which
 * hard-coded "accept the suggestion for THIS char, then click touch-continue
 * once" and hung when the gallery opened on a different character first.
 * Uses `waitVisible` (not `.isVisible({timeout})`, which Playwright ignores —
 * see that helper's doc comment) so a genuine render/recompute delay between
 * characters is never misread as "the gallery already completed".
 */
export async function driveTouchGallery(page: Page): Promise<void> {
  const seedConfirm = page.getByTestId("seed-source-confirm");
  if (await waitVisible(seedConfirm, 5_000)) {
    await seedConfirm.click();
  }

  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await waitVisible(startButton, 5_000)) {
    await startButton.click();
  }

  const continueButton = page.getByTestId("touch-continue");
  // A ui/SelectMenu like the target-script field above — its options are
  // portalled to document.body, so they go through selectMenuOption.
  const hostKeySelect = page.getByRole("button", { name: "Host key for long-press" });
  const applyButton = page.getByRole("button", { name: /^Apply touch method for/ });

  for (let guard = 0; guard < 200; guard++) {
    const stillPresent = await waitVisible(continueButton, 8_000);
    if (!stillPresent) return;

    // canGoNext (gates continueButton) requires the character to already be
    // configured; a fresh character always starts disabled (method/hostKey
    // reset on every currentChar change), so a disabled continueButton means
    // this character still needs the default long-press method + Apply.
    if (await continueButton.isDisabled()) {
      await selectMenuOption(page, hostKeySelect, "K_A");
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
 *   3. Answers pf_more_detail_gate "No" (the minimum-friction Phase F
 *      revision's required Yes/No gate, which unconditionally follows
 *      pf_usage_tip_1) — the minimal path every existing walk wants, rather
 *      than opening the optional documentation battery
 *   4. Advances through remaining optional questions in a bounded loop
 *   5. Detects arrival at #output (phase boundary)
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
  await surveyAdvance(page).click();

  // pf_more_detail_gate — required, and pf_usage_tip_1's `next` points here
  // unconditionally, so it is reliably the very next question. "No" routes
  // straight to pf_credits, skipping the opt-in battery (scope/variety,
  // provenance, canonical order, glossary, examples, troubleshooting, related
  // keyboards, limitations, further reading, project URL).
  const moreDetailNo = page.getByRole("radio", { name: "No" });
  await moreDetailNo.waitFor({ state: "visible", timeout: 15_000 });
  await moreDetailNo.check();
  await surveyAdvance(page).click();

  // Advance through remaining optional questions until we reach #output.
  // Assert Next is enabled before each click: if a future question in this
  // tail ever becomes required/gated (as il_author_name and pf_more_detail_gate
  // did above), a disabled Next would make .click() hang on actionability until
  // the test timeout — the same stale-helper hang this walk was fixed for. The
  // assertion fails fast instead, naming the question that stalled the walk.
  for (let guard = 0; guard < 15; guard++) {
    await expect(surveyAdvance(page)).not.toBeDisabled({ timeout: 15_000 });
    await surveyAdvance(page).click();
    if (/#output$/.test(page.url())) {
      return;
    }
  }
  throw new Error("driveHelpPhase: did not reach #output within the expected question count");
}

/**
 * The top-level tab route tokens, as they appear in the hash and therefore in
 * the nav link's `href`. These are ROUTE tokens, not labels — `preview` is the
 * route behind the tab the author sees as "Compare" (spec 057 FR-020 renames
 * the label only; contract §1 keeps the token so bookmarks and every existing
 * hash assertion survive).
 */
export type TabRoute = "survey" | "preview" | "output" | "trail" | "flowmap";

/**
 * Switch top-level tabs the way an author does — by clicking the nav link.
 *
 * The ONE tab-switch step driver (spec 057 FR-082): no spec assigns
 * `window.location.hash` inline, so a change to how tabs are reached lands
 * here once rather than in every walk.
 *
 * Selects by `nav a[href="#${route}"]`, deliberately NOT by visible label
 * text. The `preview` route's label flips from "Preview" to "Compare" inside
 * this feature, and a text-based selector would break this shared helper
 * across the red/green boundary — the href is the stable handle.
 *
 * Waits for the hash to actually settle before returning, so a caller can
 * assert on the destination without racing the hashchange listener.
 */
export async function switchTab(page: Page, route: TabRoute): Promise<void> {
  await page.click(`nav a[href="#${route}"]`);
  await page.waitForFunction(
    (expected) => window.location.hash.slice(1).split("/")[0] === expected,
    route,
    { timeout: 15_000 },
  );
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
