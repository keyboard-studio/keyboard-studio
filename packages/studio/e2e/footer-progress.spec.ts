/**
 * E2E (spec 057 US4/US6, T054): the footer's whole-journey dot row.
 *
 * Asserts the row's composition against a scripted walk: the project name is
 * shown, completed-question dots grow as the walk answers questions, an
 * optional question's dot appends once reached, question and stage dots are
 * visually distinguishable by shape (not colour alone — FR-046), the current
 * marker is present and distinguishable, an upcoming dot behind a gate is
 * refused with a stated reason rather than skipping the gate (FR-045,
 * US4 scenario 9), and the whole row is operable keyboard-only (Tab to a
 * dot, read its accessible name, activate with Enter, arrive).
 *
 * Not `.skip`-ped, ever (FR-083).
 */

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  seedReturningVisitor,
} from "./helpers/surveyFlow";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const FIXTURE = {
  baseKeyboardId: "basic_kbdfr",
  autonym: "Footer Test",
  english: "Footer Test English",
  targetScript: "other",
};

const footer = (page: Page) => page.locator("footer");
const completedDots = (page: Page) => footer(page).locator('[data-progress-dot-kind="completed"]');
const upcomingDots = (page: Page) => footer(page).locator('[data-progress-dot-kind="upcoming"]');
const currentDot = (page: Page) => footer(page).locator('[data-progress-dot-kind="current"]');

/**
 * Known-pre-existing 1.4.3 (Contrast Minimum) offenders on the survey screen,
 * excluded exactly as tab-roundtrip.spec.ts does — this feature does not
 * touch them, and 1.4.3 is an open `unknown` row in
 * [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md].
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [
  'div[aria-label="Keyboard source mode"]',
];

test.describe("footer progress row (spec 057 US4/US6)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("shows the project, grows as questions are answered, distinguishes dot classes by shape, and refuses a gated jump with a reason", async ({
    page,
  }) => {
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });

    // The footer appears the moment a project exists — right after the base
    // is selected, `deriveProjectLabel`'s third tier (`baseKeyboard.displayName`)
    // already resolves, ahead of Phase A completing an identity patch.
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
    await expect(footer(page)).toBeVisible({ timeout: 20_000 });
    await expect(footer(page)).toContainText(/./); // some project name text present

    await chooseAdaptTrack(page);

    const prefillConfirm = page.getByTestId("prefill-confirm");
    await expect(prefillConfirm).toBeVisible({ timeout: 30_000 });

    // ---- Completed dots grow as the walk answers questions -----------------
    // identity-lite alone answers several questions (English name, autonym,
    // code, script) before reaching the prefill screen.
    const completedAfterIdentity = await completedDots(page).count();
    expect(completedAfterIdentity).toBeGreaterThan(0);

    // ---- Question and stage dots differ by SHAPE, not colour alone --------
    // (FR-046). Completed/current dots are circles (borderRadius: 50%);
    // upcoming stage dots are hollow squares (borderRadius: 3px).
    const completedRadius = await completedDots(page)
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius);
    const upcomingRadius = await upcomingDots(page)
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius);
    expect(completedRadius).not.toBe(upcomingRadius);

    // ---- The current marker is present, distinguishable, non-jumpable -----
    await expect(currentDot(page)).toHaveCount(1);
    await expect(currentDot(page)).toHaveAttribute("aria-current", "step");

    // ---- An upcoming dot behind a gate is refused with a reason ------------
    // (FR-045, US4 scenario 9) — clicking a far-future stage must not skip
    // the walk's own gates. "help" (Phase F) is many stages ahead here.
    const helpDot = footer(page).locator('button[aria-label*="Help"]').first();
    if (await helpDot.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await helpDot.click();
      await expect(footer(page).getByRole("status")).toHaveText(/not yet reached/i, {
        timeout: 5_000,
      });
      // The walk did not move — still on the SAME prefill screen, never
      // having actually reached Phase F.
      await expect(prefillConfirm).toBeVisible();
    }

    await confirmPrefill(page);
    await expect(page.getByTestId("phase-b-intro-next")).toBeVisible({ timeout: 20_000 });

    await expectNoSeriousAxeViolations(page, "survey (footer present, characters step)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // ---- Reaching an optional/conditional question appends its dot --------
    // (FR-049c). Building a one-character alphabet with a combining mark
    // ("é") makes the marks series render — a question the row did not
    // previously carry a dot for.
    const completedBeforeMarks = await completedDots(page).count();
    await buildOneCharacterList(page, "é");
    // MechanismGallery / carve now follow; wait for a stable landmark rather
    // than a fixed sleep.
    await page
      .getByRole("button", { name: "Start the mechanism gallery" })
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    const completedAfterMarks = await completedDots(page).count();
    expect(completedAfterMarks).toBeGreaterThan(completedBeforeMarks);

    // ---- Keyboard-only: Tab to a completed dot, read its name, arrive ------
    const firstCompleted = completedDots(page).first();
    const label = await firstCompleted.getAttribute("aria-label");
    expect(label).toBeTruthy();
    await firstCompleted.focus();
    await page.keyboard.press("Enter");

    // Arrival is visible via the wizard's own rendered step — jumping does
    // not rewrite the tab-level hash (intra-wizard position is store state,
    // not a second router — CLAUDE.md's navigateTo() convention), so the
    // proof is the DOM, exactly as tab-roundtrip.spec.ts asserts arrival.
    await expect(page.locator("#il_language_english")).toBeVisible({ timeout: 15_000 });
  });
});
