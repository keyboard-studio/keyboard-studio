/**
 * E2E: spec 092 US1 — the series acceptance test (FR-005), run in the LIVE
 * wizard (never the demo, per the owner's words carried in the spec).
 *
 * One declaration changes: `il_copyright_holder` requires the
 * authoring-track decision. Nothing else about the question changes. On
 * the completed stack (091's derived order places the question after the
 * track choice; 092's extraction pass has run at setup) the two tracks
 * diverge at that one question:
 *
 *   - ADAPT from basic_kbdfr: the question arrives AFTER the track choice,
 *     pre-filled with the base keyboard's own copyright notice —
 *     "(c) 2009-2019 SIL International" — and labelled "from basic_kbdfr".
 *     The author may still change it.
 *   - COPY from basic_kbdfr: the holder defaults to the author (D1); the
 *     copied notice is NOT offered for re-entry — the field is not
 *     pre-filled with it and no "from basic_kbdfr" label appears (an
 *     author re-typing the holder by hand is exactly the D4 duplicate-
 *     holder hazard the module's help text guards against).
 *
 * CI-GATED: per the owner's ruling, live captures run in CI; the sandbox
 * cannot navigate Playwright to localhost. Store-level evidence for the
 * same behaviours lives in src/decisions/liveExtraction.test.ts and
 * tests/steps/stepHost.liveExtraction.test.tsx.
 */
import { test, expect } from "playwright/test";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  chooseTrackCopy,
  surveyAdvance,
} from "./helpers/surveyFlow";

const BASE_COPYRIGHT = "(c) 2009-2019 SIL International";

async function driveToTrackChoice(page: Parameters<typeof driveIdentityLite>[0]) {
  await seedReturningVisitor(page);
  await page.goto("/");
  // Identity minus the copyright question: with FR-005's requires edge it
  // no longer renders in the identity sequence.
  await driveIdentityLite(page, {
    languageCode: "fr",
    authorName: "Test Author",
    deferCopyright: true,
  });
  await pickBaseKeyboard(page, "basic_kbdfr");
}

test("spec 092 US1 (adapt): copyright question arrives after the track choice, pre-filled from the base keyboard", async ({
  page,
}) => {
  await driveToTrackChoice(page);
  await chooseAdaptTrack(page);

  // The question arrives now — after the track choice, not in identity.
  const field = page.locator("#il_copyright_holder");
  await field.waitFor({ state: "visible", timeout: 15_000 });

  // Pre-filled from basic_kbdfr's own header, source labelled.
  await expect(field).toHaveValue(BASE_COPYRIGHT);
  await expect(page.getByText(/from basic_kbdfr/)).toBeVisible();

  // Still the author's to change: overwrite and advance without error.
  await field.fill("My Own Holder");
  await surveyAdvance(page).click();
  await expect(field).toBeHidden({ timeout: 15_000 });
});

test("spec 092 US1 (copy): holder defaults to the author; the copied notice is not offered", async ({
  page,
}) => {
  await driveToTrackChoice(page);
  await chooseTrackCopy(page);

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
