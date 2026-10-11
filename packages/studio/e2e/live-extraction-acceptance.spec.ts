/**
 * E2E: spec 092 US1 — the series acceptance test (FR-005), run in the LIVE
 * wizard (never the demo, per the owner's words carried in the spec).
 *
 * The placement is #1901's: the author/copyright questions form their own
 * attribution step AFTER the track choice (the identity step no longer
 * asks them), and 092's extraction pass has run at setup. The two tracks
 * diverge at the attribution step's last question:
 *
 *   - UPDATE (adapt) from basic_kbdfr: the copyright question arrives
 *     pre-filled with the base keyboard's own copyright notice —
 *     "(c) 2009-2019 SIL International" — and labelled "from basic_kbdfr".
 *     The existing holder is preserved by default; the author may still
 *     change it, but is not prompted to re-enter it.
 *   - COPY from basic_kbdfr: the holder defaults to the author (D1); the
 *     copied notice is NOT offered for re-entry — the field is not
 *     pre-filled with it and no "from basic_kbdfr" label appears (an
 *     author re-typing the holder by hand is exactly the D4 duplicate-
 *     holder hazard the module's help text guards against).
 *
 * CI-GATED: per the owner's ruling, live captures run in CI; the sandbox
 * cannot navigate Playwright to localhost. Store-level evidence for the
 * same behaviours lives in src/decisions/liveExtraction.test.ts,
 * src/decisions/liveExtraction.stepHost.test.ts (incl. the post-#1901
 * setup order), and steps/applyDecisionEffects.attributionCompletion.test.tsx.
 */
import { test, expect } from "playwright/test";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  chooseTrackCopy,
  acceptProjectName,
  confirmPrefill,
  surveyAdvance,
} from "./helpers/surveyFlow";

const BASE_COPYRIGHT = "(c) 2009-2019 SIL International";

async function driveToTrackChoice(page: Parameters<typeof driveIdentityLite>[0]) {
  await seedReturningVisitor(page);
  await page.goto("/");
  // Identity carries no author/copyright questions anymore (#1901) — they
  // are the attribution step's, after the track choice.
  await driveIdentityLite(page, { languageCode: "fr" });
  await pickBaseKeyboard(page, "basic_kbdfr");
}

/**
 * Answer the attribution step's first two questions (author name, then
 * the optional email left blank) so the walk stands on the copyright
 * question — the subject of both tests below.
 */
async function driveToCopyrightQuestion(page: Parameters<typeof driveIdentityLite>[0]) {
  const nameField = page.locator("#il_author_name");
  await nameField.waitFor({ state: "visible", timeout: 15_000 });
  await nameField.fill("Test Author");
  await surveyAdvance(page).click();
  const emailField = page.locator("#il_author_email");
  await emailField.waitFor({ state: "visible", timeout: 15_000 });
  await surveyAdvance(page).click();
}

test("spec 092 US1 (adapt): copyright question arrives after the track choice, pre-filled from the base keyboard", async ({
  page,
}) => {
  await driveToTrackChoice(page);
  await chooseAdaptTrack(page);
  await driveToCopyrightQuestion(page);

  // The question arrives now — in the post-track attribution step, not in
  // identity.
  const field = page.locator("#il_copyright_holder");
  await field.waitFor({ state: "visible", timeout: 15_000 });

  // Pre-filled from basic_kbdfr's own header, source labelled.
  await expect(field).toHaveValue(BASE_COPYRIGHT);
  await expect(page.getByText(/from basic_kbdfr/)).toBeVisible();

  // Still the author's to change: overwrite and advance without error.
  await field.fill("My Own Holder");
  await surveyAdvance(page).click();
  await expect(field).toBeHidden({ timeout: 15_000 });

  // Spec 092 SC-004 (T042): the working copy was instantiated as an
  // adaptation at the FIRST commit after the track choice — no page
  // refresh anywhere in this walk (nothing here calls page.reload) and
  // no second commit: the flow continues straight through project name
  // to the prefill confirmation, which renders from the instantiated
  // working copy. (The instantiation mode itself is asserted at store
  // level — instantiationMode "adapt-existing" — in the reducer/StepHost
  // suites; this leg pins that the live flow never needs a refresh or a
  // re-commit to get there.)
  await acceptProjectName(page);
  await confirmPrefill(page);
  await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 15_000 });
});

test("spec 092 US1 (copy): holder defaults to the author; the copied notice is not offered", async ({
  page,
}) => {
  await driveToTrackChoice(page);
  await chooseTrackCopy(page);
  await driveToCopyrightQuestion(page);

  const field = page.locator("#il_copyright_holder");
  await field.waitFor({ state: "visible", timeout: 15_000 });

  // Not pre-filled with the copied notice, and no extraction label offers
  // it for re-entry. Blank = "same as the author" (D1).
  await expect(field).toHaveValue("");
  await expect(page.getByText(/from basic_kbdfr/)).toHaveCount(0);
  await expect(page.getByText(BASE_COPYRIGHT)).toHaveCount(0);

  // Leaving it blank advances cleanly — the default-to-author applies.
  await surveyAdvance(page).click();
  await expect(field).toBeHidden({ timeout: 15_000 });
});
