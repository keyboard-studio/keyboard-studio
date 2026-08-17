/**
 * E2E (spec 057 US3, T045): jump from a recorded decision back to the
 * decision point, revise it, and see the trail record the revision.
 *
 * FR-030/FR-031: the trail's jump control lands the author back on the
 * question with its recorded value still showing.
 * FR-032/FR-034 (Q3 revise-and-return): confirming a changed answer reached
 * by deep link returns the author to Decisions, not onward through the walk.
 * FR-015/supersession (053 FR-015, unchanged by this feature): the trail
 * shows the old entry marked replaced, alongside the new one.
 *
 * TARGET QUESTION, AND WHY: the "track" step (question `track_choice`,
 * audit label "Authoring approach" — content/i18n/en/flowQuestions.json) is
 * chosen deliberately because it is a SINGLE-question step. Landing "on the
 * step" and landing "on the question" are the same event for it, which
 * sidesteps an open architecture gap this feature does not close: no shared
 * store today records which question a MULTI-question step (e.g. "identity")
 * was showing, so a deep link that also names a `question` can only
 * guarantee the right STEP, not necessarily the right sub-question inside a
 * multi-question flow (see decisions/progressDots.ts's own comment on this
 * same gap). A single-question step has no such ambiguity to paper over.
 *
 * STALENESS, AND WHY THIS SPEC DOES NOT ASSERT A VISIBLE CUE FOR IT: SC-008
 * asks that a deep-linked revision "mark the same steps stale as the
 * ordinary walk would" — a NON-REGRESSION claim, not a promise that
 * revising a survey ANSWER newly starts marking anything stale. Today's
 * production `staleSteps` mechanism only fires for the mechanisms→touch
 * pairing (reducer.ts's own TOUCH_STEP_ID comment); no survey-answer step,
 * ordinary or deep-linked, marks any step stale via the generic completion
 * path (verified directly against the reducer in
 * src/decisions/deepLinkRevision.test.tsx, T044, which drives the identical
 * edit both ways and asserts the two outcomes are byte-for-byte the same).
 * Asserting a staleness UI here that does not exist for either path would
 * not be testing this feature — it would be testing a screen that isn't
 * there. What IS asserted, and is the real user-visible claim SC-008 makes,
 * is the supersession: exactly one new entry, linked to the one it replaces.
 */

import { test, expect } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  chooseTrackCopy,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const FIXTURE = {
  baseKeyboardId: "basic_kbdfr",
  autonym: "Test Autonym",
  english: "Test",
  targetScript: "other",
};

/** The audit label track_choice's decision entries render under (FR-008)
 * — content/i18n/en/flowQuestions.json's `track_choice.audit_label`. Used
 * to locate the entry without depending on the internal entryId sequence,
 * which shifts with how many identity sub-answers happened to get recorded
 * this run. */
const TRACK_QUESTION_LABEL = /Authoring approach/i;

/**
 * #1477's ground-truth sweep (live axe run with this list emptied) found
 * SignUpPanel's GitHub button and the survey's own Continue/advance button —
 * the two entries this list used to carry — already clean. The remaining OSK
 * iframe entry is now also fixed at the source
 * (packages/studio/public/osk-frame.html overrides `.kmw-spacebar-caption`'s
 * color), so this scan now covers everything the frame renders. Kept as an
 * empty array so `exclude: KNOWN_CONTRAST_DEBT` below keeps compiling.
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [];

test.describe("decision-trail deep link -> revise -> supersede (spec 057 US3)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("activating a trail entry's link lands on its question, revising it supersedes and returns to Decisions", async ({
    page,
  }) => {
    // ---- Walk far enough to have a real, multi-step decision record -------
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
    await chooseAdaptTrack(page);

    // Past "track" now (adapt-track skips project_name straight to
    // characters — steps/manifest.ts's track-routing docstring), so the
    // prefill summary is the phase boundary landmark.
    await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 30_000 });

    // ---- Open Decisions and find the early "track" answer ------------------
    await switchTab(page, "trail");
    await expectNoSeriousAxeViolations(page, "trail (before revision)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    const trackEntry = page
      .locator('[data-testid="decision-entry"]')
      .filter({ hasText: TRACK_QUESTION_LABEL })
      .first();
    await expect(trackEntry).toBeVisible({ timeout: 15_000 });
    // Nothing superseded yet — this is the entry the revision below creates.
    await expect(trackEntry.getByTestId("decision-entry-superseded")).toHaveCount(0);

    // ---- Activate the jump --------------------------------------------------
    await trackEntry.getByTestId("decision-entry-jump").click();

    // FR-030/FR-031: arrives on the "track" step with the recorded answer
    // ("adapt") still shown. A single-question step, so "on the step" and
    // "on the question" are the same landing — see the module header.
    await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("track-adapt")).toBeChecked();

    // FR-034/Q3: the revise-and-return banner is up, with its explicit
    // opt-out — the choice is offered, not forced, and not a modal prompt.
    await expect(page.getByTestId("step-deep-link-return-banner")).toBeVisible();
    await expect(page.getByTestId("step-deep-link-continue-instead")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "survey: track (deep-link arrival)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // ---- Revise the answer ---------------------------------------------------
    await chooseTrackCopy(page);

    // FR-034's default (Q3): confirming returns the author to where the link
    // was activated, not onward through the ordinary walk.
    await expect(page).toHaveURL(/#trail$/, { timeout: 15_000 });

    // ---- The trail shows the supersession, exactly once ---------------------
    const trackEntriesAfter = page
      .locator('[data-testid="decision-entry"]')
      .filter({ hasText: TRACK_QUESTION_LABEL });
    await expect(trackEntriesAfter).toHaveCount(2, { timeout: 15_000 });

    const supersededCount = await trackEntriesAfter.getByTestId("decision-entry-superseded").count();
    expect(supersededCount).toBe(1);

    await expectNoSeriousAxeViolations(page, "trail (after revision)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });
  });
});
