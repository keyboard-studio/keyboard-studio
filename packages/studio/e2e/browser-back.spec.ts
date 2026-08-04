/**
 * E2E: the physical/native browser Back button mid-survey (F7 — "the back
 * button does not work").
 *
 * Flow under test:
 *   identity-lite step
 *     -> base-keyboard picker
 *       -> track choice (adapt)
 *         -> characters step (Phase B intro)
 *           -> browser Back (page.goBack()) -> track choice reappears
 *             -> browser Back again -> base picker reappears
 *
 * Unlike the existing spec 034 US3 "Back round-trips" coverage in
 * copy-edit.spec.ts (which clicks the in-app "<- Back" button), this spec
 * drives Playwright's own `page.goBack()` — the literal browser Back button —
 * to prove hooks/useSurveyBrowserHistorySync.ts's popstate bridge, not just
 * the in-app dispatch StepHost already had.
 *
 * NOT run as part of this change (per house convention, e2e specs are
 * authored by the front-end seat and verified by a separate pass); written to
 * slot into the existing helper pattern in ./helpers/surveyFlow.ts.
 *
 * Playwright runs via the global CLI (`npx playwright test`); this spec (like
 * copy-edit.spec.ts) imports from "playwright/test".
 */

import { test, expect } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  seedReturningVisitor,
  switchTab,
} from "./helpers/surveyFlow";

const FIXTURE = {
  baseKeyboardId: "basic_kbdfr",
  autonym: "Test",
  english: "Test",
  targetScript: "Latn",
};

test.describe("browser Back mid-survey (F7)", () => {
  test.beforeEach(async ({ page }) => {
    // Draft-safe first-visit seed (see driveIdentityLite/copy-edit.spec.ts's
    // own beforeEach) — lands directly on identity instead of WelcomeScreen.
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("physical Back button steps back one manifest step at a time", async ({ page }) => {
    // Walk: identity -> choose_base -> track -> characters (adapt skips
    // project_name — see steps/manifest.ts's track-routing docstring).
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
    await chooseAdaptTrack(page);

    // Now on "characters" (its "prefill" sub-stage renders first — see
    // CharactersStep.tsx). Which sub-stage of "characters" we land on doesn't
    // matter for this test: the browser-history entry pushed for "characters"
    // is ONE entry regardless of the prefill -> B intra-step substage
    // transition (that substage never touches surveySessionStore.history).
    await page.waitForSelector('[data-testid="prefill-confirm"]', { timeout: 20_000 });

    // Spec 057 FR-017 / SC-014: run the native Back sequence below against a
    // PRESERVED position, not a fresh one. Before the D-1 fix, leaving #survey
    // and returning reset the traversal store — which emptied `history`, so
    // `expectedBackTarget` could no longer name any entry still on the browser
    // stack and every native Back silently degraded to a no-op. The bridge
    // therefore has to be exercised on the far side of a round trip, or the
    // case that used to be broken is never covered.
    await switchTab(page, "preview");
    await switchTab(page, "survey");
    await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 20_000 });

    // Unwind the two untagged entries the round trip pushed. Each hash-route
    // change is a browser entry carrying no ksStep of ours (state === null),
    // and the bridge's listener returns early on those — so both pops are
    // no-ops in the store by construction (see useSurveyBrowserHistorySync.ts,
    // rule 3 "THE TAB-SWITCH ENTRY ITSELF"). This restores the browser pointer
    // to the pre-round-trip entry WITHOUT mutating the wizard — which is
    // exactly the precondition FR-017 wants the native Back sequence below
    // run against.
    await page.goBack();
    await page.goBack();
    await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 20_000 });

    // One physical Back: characters -> track. The track radio choice
    // reappears (its own onComplete re-fires chooseAdaptTrack forward again
    // below to confirm the walk is genuinely reversible, not just "some
    // earlier screen appeared").
    await page.goBack();
    await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 15_000 });

    // A second physical Back: track -> choose_base. The base picker
    // reappears — proves the browser's own history stack (not just the
    // in-app "<- Back" dispatch) drives the wizard back two full manifest
    // steps in a row.
    await page.goBack();
    await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });

    // Browser Forward is a DELIBERATE no-op by design (see
    // useSurveyBrowserHistorySync.ts's module docstring: a Forward navigation
    // never matches expectedBackTarget's prediction, so it is silently
    // ignored rather than mutating the store off an unverified guess). The
    // browser's own position moves, but the survey wizard's UI does not —
    // asserting that here, rather than a wrongly-expected restore to
    // "track", keeps this spec honest about the actual (accepted) behavior.
    await page.goForward();
    await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
  });
});
