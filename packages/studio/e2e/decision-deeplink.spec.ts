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
 * TARGET QUESTION, AND WHY: the attribution step's first question,
 * `il_author_name`. Its trail label is its prompt — "Who should be credited
 * as the author of this keyboard?" — because the question declares no
 * `audit_label` (decisions/lookupQuestionLabel.ts falls back audit_label ->
 * prompt).
 *
 * The original target was the track step's `track_choice`, chosen because
 * it is a SINGLE-question step. After spec 111 the track step is skipped on
 * every path and its trail entry renders no jump link, so that target is
 * gone. `il_author_name` is the retarget (issue #2521; ruling in
 * ~/workspace/keyboard-studio-notes/2521-ruling.md):
 *
 * - It is the first question of the attribution step, so landing "on the
 *   step" and landing "on the question" are the same event for it.
 * - The multi-question gap the old header cited is closed: lib/stepWalk.ts
 *   closes the "CURRENT QUESTION" gap, and SurveyRunner honours a jump's
 *   parked question cursor on mount, so a deep link naming a question lands
 *   on that question even in a completed multi-question step.
 * - The "both paths" half of #2521's ask is not satisfiable as written:
 *   the Open walk contains no survey-question step at all (galleries and
 *   editors only), so no single-question step is walked by both real paths.
 *   The deeplink machinery under test is path-independent, so this
 *   Copy-walk retarget restores the lost coverage; Open-side deeplink
 *   coverage is a separate follow-up.
 *
 * The track entry's current state is pinned, not re-tested as a target:
 * once its answer exists the track gate closes behind it, so its location
 * resolves skipped-by-track and the row shows "Your track skips this step"
 * with no jump link (see the ruling; draft PR #2568 removes the step).
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
  pickStartKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  driveAttributionStep,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const FIXTURE = {
  startKeyboardId: "basic_kbdfr",
  autonym: "Test Autonym",
  english: "Test",
  targetScript: "other",
};

/** The trail label `il_author_name`'s decision entries render under: its
 * prompt (no `audit_label` declared) — content/i18n/en/flowQuestions.json's
 * `il_author_name.prompt`. Used to locate the entry without depending on
 * the internal entryId sequence, which shifts with how many identity
 * sub-answers happened to get recorded this run. */
const AUTHOR_QUESTION_LABEL = /Who should be credited as the author/i;

/** The audit label `track_choice`'s decision entries render under (FR-008)
 * — content/i18n/en/flowQuestions.json's `track_choice.audit_label`. Used
 * only to pin the retired track entry's no-jump-link state (see the module
 * header), not as the revision target. */
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
    await pickStartKeyboard(page, FIXTURE.startKeyboardId);
    await chooseTrackCopy(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);

    // Past "track" now, so the prefill summary is the phase boundary landmark.
    await expect(page.getByTestId("prefill-continue")).toBeVisible({ timeout: 30_000 });

    // ---- Open Decisions and find the author-name answer --------------------
    await switchTab(page, "trail");
    await expectNoSeriousAxeViolations(page, "trail (before revision)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    const authorEntry = page
      .locator('[data-testid="decision-entry"]')
      .filter({ hasText: AUTHOR_QUESTION_LABEL })
      .first();
    await expect(authorEntry).toBeVisible({ timeout: 15_000 });
    // Nothing superseded yet — this is the entry the revision below creates.
    await expect(authorEntry.getByTestId("decision-entry-superseded")).toHaveCount(0);

    // ---- The retired track entry: reason, no jump link ---------------------
    // Once its answer exists the track gate closes behind it, so the trail
    // records it with no jump link (issue #2521; ruling in
    // keyboard-studio-notes/2521-ruling.md). Pinned, not revised: the step
    // is unrevisitable by design, and draft PR #2568 removes it.
    const trackEntry = page
      .locator('[data-testid="decision-entry"]')
      .filter({ hasText: TRACK_QUESTION_LABEL })
      .first();
    await expect(trackEntry).toBeVisible({ timeout: 15_000 });
    await expect(trackEntry.getByTestId("decision-entry-jump")).toHaveCount(0);
    await expect(trackEntry.getByTestId("decision-entry-jump-unreachable")).toHaveCount(1);
    await expect(trackEntry.getByTestId("decision-entry-jump-unreachable")).toContainText(
      /skips this step/i,
    );

    // ---- Activate the jump --------------------------------------------------
    await authorEntry.getByTestId("decision-entry-jump").click();

    // FR-030/FR-031: arrives on the attribution step's first question with
    // the recorded answer ("Test Author") still shown. The jump names the
    // question and the runner honours the parked cursor, so "on the step"
    // and "on the question" are the same landing — see the module header.
    const nameField = page.locator("#il_author_name");
    await expect(nameField).toBeVisible({ timeout: 15_000 });
    await expect(nameField).toHaveValue("Test Author");

    // FR-034/Q3: the revise-and-return banner is up, with its explicit
    // opt-out — the choice is offered, not forced, and not a modal prompt.
    await expect(page.getByTestId("step-deep-link-return-banner")).toBeVisible();
    await expect(page.getByTestId("step-deep-link-continue-instead")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "survey: attribution (deep-link arrival)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    // ---- Revise the answer ---------------------------------------------------
    // Re-drive the attribution step with a different author name; the email
    // and copyright questions are unchanged, so their re-submission records
    // nothing (identical revisit). Step completion returns to Decisions
    // (FR-034's default, Q3) rather than onward through the walk.
    await driveAttributionStep(page, { authorName: "Revised Author" });

    // FR-034's default (Q3): confirming returns the author to where the link
    // was activated, not onward through the ordinary walk.
    await expect(page).toHaveURL(/#trail$/, { timeout: 15_000 });

    // ---- The trail shows the supersession, exactly once ---------------------
    const authorEntriesAfter = page
      .locator('[data-testid="decision-entry"]')
      .filter({ hasText: AUTHOR_QUESTION_LABEL });
    await expect(authorEntriesAfter).toHaveCount(2, { timeout: 15_000 });

    const supersededCount = await authorEntriesAfter.getByTestId("decision-entry-superseded").count();
    expect(supersededCount).toBe(1);

    await expectNoSeriousAxeViolations(page, "trail (after revision)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });
  });
});
