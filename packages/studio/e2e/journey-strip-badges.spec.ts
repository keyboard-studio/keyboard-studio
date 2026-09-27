/**
 * E2E (spec 079 US3, T067): the two-tier journey strip's grain, badges, jump,
 * and overflow behaviour — journey-strip-contract.md's test matrix §10.
 *
 * Companion to e2e/footer-progress.spec.ts (057's grain/shape/jump coverage);
 * this file covers what 079 adds on top: per-station expand/collapse, the
 * screen-grain grouping for a multi-answer Next, a real reproposal's notice
 * + badge, the badged-collapsed-section jump exception (§5), the badge
 * clearing once resolved, and overflow with the wider two-tier row.
 *
 * Not `.skip`-ped, ever (FR-083, mirrored from footer-progress.spec.ts).
 */

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  drivePunctuationStep,
  driveInvisiblesStep,
  driveConvenienceStep,
  driveMarksSeries,
  driveMechanismsGallery,
  driveTouchGallery,
  driveHelpPhase,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const FIXTURE = {
  baseKeyboardId: "basic_kbdfr",
  autonym: "Journey Strip Test",
  english: "Journey Strip Test English",
  targetScript: "other",
};

const footer = (page: Page) => page.locator("footer");
const questionMarks = (page: Page) => footer(page).locator('[data-progress-dot-tier="question"]');
const marksButton = (page: Page) =>
  footer(page).locator('button[aria-label^="Accents & marks"]').first();
const invisiblesButtons = (page: Page) =>
  footer(page).locator('button[aria-label^="Invisible characters"]');

async function startToCharacters(page: Page): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, {
    english: FIXTURE.english,
    autonym: FIXTURE.autonym,
    script: FIXTURE.targetScript,
  });
  await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
}

test.describe("journey strip — grain, badges, jump, overflow (spec 079 US3)", () => {
  test("Accents & marks expands into per-station question marks while active, and collapses to one section mark on leaving", async ({
    page,
  }) => {
    await startToCharacters(page);

    // Phase B: add a mark-bearing letter so the marks series (spec 071) has
    // something to walk (a marks-free alphabet auto-skips the whole series).
    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
    await page.click('[data-testid="phase-b-intro-next"]');
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', "é");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 5_000 });
    await page.click('[data-testid="phase-b-done"]');

    // Now on the marks series (its S0 gate passed — "é" carries a mark).
    const marksContinue = page.getByTestId("marks-continue");
    await expect(marksContinue).toBeVisible({ timeout: 20_000 });

    // While active, "Accents & marks" is EXPANDED: every mark labelled for it
    // is QUESTION tier (one per station — each station's own label falls
    // back to the stage name today, since MarksSeriesStep's stops publish no
    // per-station label of their own), never a single collapsed SECTION mark.
    await expect(footer(page)).toBeVisible({ timeout: 10_000 });
    const activeMarksButtons = footer(page).locator('button[aria-label^="Accents & marks"]');
    const activeCount = await activeMarksButtons.count();
    expect(activeCount).toBeGreaterThan(0);
    for (let i = 0; i < activeCount; i++) {
      await expect(activeMarksButtons.nth(i)).toHaveAttribute("data-progress-dot-tier", "question");
    }
    const activeQuestionMarks = await questionMarks(page).count();
    expect(activeQuestionMarks).toBeGreaterThan(0);

    // Walk the whole series to completion (accepting every proposal).
    await driveMarksSeries(page);
    await drivePunctuationStep(page);
    await driveInvisiblesStep(page);
    await driveConvenienceStep(page);

    // Leaving marks collapses it back to exactly ONE section-tier mark —
    // never left mid-expanded, and never duplicated.
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(marksButton(page)).toHaveCount(1);
    await expect(marksButton(page)).toHaveAttribute("data-progress-dot-tier", "section");
  });

  test("completing Invisible characters with several candidates checked adds exactly one mark, not one per candidate", async ({
    page,
  }) => {
    await startToCharacters(page);

    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
    await page.click('[data-testid="phase-b-intro-next"]');
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', "k");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 5_000 });
    await page.click('[data-testid="phase-b-done"]');

    // "k" carries no mark and no punctuation — the marks series and
    // punctuation step both auto-skip, landing directly on invisibles.
    await driveMarksSeries(page);
    await drivePunctuationStep(page);

    const continueBtn = page.getByTestId("invisibles-continue");
    await continueBtn.waitFor({ state: "visible", timeout: 20_000 });

    // Check TWO candidates — one `Next` recording two answers under one screen.
    await page.getByTestId("invisible-candidate-200d").click(); // ZWJ
    await page.getByTestId("invisible-candidate-200c").click(); // ZWNJ
    await continueBtn.click();

    await driveConvenienceStep(page);
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });

    // Exactly one mark for the whole invisibles screen, whatever tier it
    // rendered at, however many candidates were accepted.
    await expect(invisiblesButtons(page)).toHaveCount(1);
  });

  test("overflow: a long walk still keeps the current mark visible and every mark reachable", async ({
    page,
  }) => {
    // A narrow viewport makes the two-tier row (wider than 057's single-tier
    // one, per journey-strip-contract.md §6) actually overflow, rather than
    // relying on however many marks happen to fit the default window.
    await page.setViewportSize({ width: 480, height: 720 });
    await startToCharacters(page);
    await buildOneCharacterList(page, "é");
    // buildOneCharacterList stops on carve; accept it with nothing discarded.
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("carve-continue").click();
    // "é" on basic_kbdfr is a real new character to place (unlike carve.spec's
    // marks-free "᙮" fixture, which empty-diffs) — drive whatever the gallery
    // actually presents rather than assuming the empty-diff exit.
    await driveMechanismsGallery(page);
    await driveTouchGallery(page);

    // Still walking "help" — the row has accumulated every earlier stage's
    // section mark plus "help"'s own current position. The scroll-into-view
    // effect (StudioFooter.tsx, keyed on `[data-progress-dot-kind="current"]`)
    // must have kept the current mark inside the row's visible scroll area,
    // not scrolled past it — checked via Playwright's own viewport-relative
    // visibility, which fails if the element is scrolled out of its
    // clipping ancestor.
    const current = footer(page).locator('[data-progress-dot-kind="current"]');
    await expect(current).toBeVisible({ timeout: 15_000 });
    // Every mark — not just the current one — stays reachable by Tab
    // regardless of scroll position (native focus-scroll).
    // Scoped to the dot row: the footer's first button is now the step's Back
    // (spec 081), not a dot.
    const row = footer(page)
      .getByTestId("progress-dot-row")
      .locator('[role="button"], button')
      .first();
    expect(await row.isVisible()).toBe(true);

    await driveHelpPhase(page);
    await page.waitForURL(/#output$/);
  });

  test("a real reproposal (marks) shows the FR-016 notice and a live badge, which clears once resolved", async ({
    page,
  }) => {
    // HONESTY NOTE: the full US3 scenario 5 ("jump to a distant badge from
    // carve/mechanisms without moving the author, via the journey strip")
    // needs the footer's jump to carry a `returnTo` the way the decision
    // trail's deep links do (FR-034) — `StudioFooter.tsx`'s own
    // `handleActivate` calls `jumpToLocation(dot.location)` with no `opts`,
    // so a footer-triggered jump back to Characters does NOT raise the
    // revise-and-return banner and does NOT return the author to carve on
    // confirm; it walks forward again like any other revisit. This test
    // exercises the reproposal machinery itself (a real stale attachment
    // key, not a fixture) plus the notice and the live badge on marks WHILE
    // marks is reachable in the normal forward walk, which is what the
    // footer's jump mechanism as built today actually supports end to end.
    await startToCharacters(page);
    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
    await page.click('[data-testid="phase-b-intro-next"]');
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', "é");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 5_000 });
    await page.click('[data-testid="phase-b-done"]');

    await driveMarksSeries(page);
    await drivePunctuationStep(page);
    await driveInvisiblesStep(page);
    await driveConvenienceStep(page);
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });

    // Back to Characters via the journey strip's own "Characters" section
    // mark (a plain jump — no return target, per the note above).
    const charactersButton = footer(page).locator('button[aria-label^="Characters"]').first();
    await expect(charactersButton).toBeVisible({ timeout: 10_000 });
    await charactersButton.click();

    // Add a SECOND mark-bearing character — new evidence for the marks
    // series' attachment/treatment proposals.
    await page.waitForSelector('[aria-label="Character to add"]', { timeout: 10_000 });
    await page.fill('[aria-label="Character to add"]', "ü");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.waitForSelector('[data-testid="phase-b-done"]:not([disabled])', { timeout: 5_000 });
    await page.click('[data-testid="phase-b-done"]');

    // The walk lands back on marks (its S0 gate re-fires for the new
    // evidence) — the FR-016 notice fires on THIS Next, and marks' own
    // "needs reconfirming" cue (T058) shows for the affected station,
    // exactly the vocabulary `survey/reproposalReason.ts` and the journey
    // strip's badge both draw from.
    await expect(footer(page).getByRole("status")).toContainText(/reconfirming/i, {
      timeout: 15_000,
    });
    await expect(page.getByText(/needs reconfirming/i).first()).toBeVisible({ timeout: 10_000 });
    // The active marks question mark(s) carry the badge live, while the
    // author is right there looking at the flagged station.
    const badgedQuestionMark = footer(page).locator(
      '[data-progress-dot-tier="question"][aria-label*="work waiting"]',
    );
    await expect(badgedQuestionMark.first()).toBeVisible({ timeout: 10_000 });
    // Each station renders once (walk and record never double up), so the
    // row has exactly one "you are here".
    await expect(footer(page).locator('[data-progress-dot-kind="current"]')).toHaveCount(1);
    // The same Next badged the later gallery too — without moving the author.
    await expect(
      footer(page).locator('button[aria-label^="Mechanisms"][aria-label*="work waiting: assign a key"]'),
    ).toHaveCount(1);

    // Next is blocked while an EARLIER station is flagged (FR-013) — the
    // re-entry lands on the saved position, past the flagged attachment rows.
    await expect(page.getByTestId("marks-continue")).toBeDisabled();

    // Each flag names its own base+mark combination, so no two links share an
    // accessible name (WCAG 2.4.4) — "ü" is told apart from "ú".
    const flagLinks = page.getByTestId("flagged-answers-list").getByRole("button");
    const names = await flagLinks.allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);

    // Resolve the way an author would: follow the first flag back to its
    // station, then re-confirm every station forward (each Continue re-stamps
    // that station's answers with the current evidence). That clears the
    // badge once the work is done.
    await flagLinks.first().click();
    await expect(page.getByTestId("marks-continue")).toBeEnabled({ timeout: 10_000 });
    await driveMarksSeries(page);
    await drivePunctuationStep(page);
    await driveInvisiblesStep(page);
    await driveConvenienceStep(page);
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(marksButton(page)).not.toHaveAttribute("aria-label", /work waiting/i);
  });

  test("the Mechanisms 'assign a key' badge shows on arrival at the gallery and clears once every key is assigned (US3 scenario 5)", async ({
    page,
  }) => {
    // Jumping to the badge from an earlier stage is refused like any other
    // upcoming-stage jump (journey-strip-contract.md §5: the badge does not
    // bypass the gate), so this walks forward to the gallery itself.
    await startToCharacters(page);
    await buildOneCharacterList(page, "é");
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("carve-continue").click();

    const mechanismsMark = footer(page).locator('button[aria-label^="Mechanisms"]');
    await expect(mechanismsMark).toHaveCount(1, { timeout: 15_000 });
    await expect(mechanismsMark).toHaveAttribute("aria-label", /work waiting: assign a key/);

    await driveMechanismsGallery(page);

    // Past the gallery with every character placed: the badge is gone.
    await expect(mechanismsMark).toHaveCount(1, { timeout: 15_000 });
    await expect(mechanismsMark).not.toHaveAttribute("aria-label", /work waiting/);
  });
});
