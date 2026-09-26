// E2E: the Convenience letters question fires for letters a language uses only
// in loanwords.
//
// Bafut (`bfd`) is the case that exposed the gap. Its SLDR main tier has no
// c, p, q, v or x; SLDR lists those (with h and ʼ) as auxiliary, loanword-only
// letters. Accepting Bafut's exemplars on a basic_kbdus base therefore leaves
// five basic-Latin letters the alphabet does not use, and "Keep these letters
// for convenience?" must ask about them. It used to skip silently, because the
// auxiliary tier was counted as needed.
//
// Two walks on the copy track (see reachBafutAlphabet for why), both through
// the REAL sourcing path (the committed offline exemplar index — no network,
// no stubbing):
//
//   accept    — accept the exemplars as proposed. The alphabet screen shows
//               the loanword letters unselected, and the convenience question
//               offers exactly c p q v x.
//   add one   — add q from the Loanword letters section before Done. q is then
//               part of the alphabet, so the question offers only c p v x.
//   add all   — "Add all loanword letters" before Done. Every basic-Latin
//               letter is then needed, so the question is skipped.
//
// All three use driveConvenienceStep's strict modes: if the gate stops
// opening (or stops skipping), the walk fails here instead of passing straight
// through to carve.
//
// Run (see playwright.config.ts header):
//   cd packages/studio && npx playwright test convenience-loanwords.spec.ts

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  confirmPrefill,
  seedReturningVisitor,
  driveMarksSeries,
  drivePunctuationStep,
  driveInvisiblesStep,
  driveConvenienceStep,
} from "./helpers/surveyFlow";

const BASE_KEYBOARD_ID = "basic_kbdus";

/** Identity answers that resolve the target language to Bafut. */
const BAFUT = { english: "Bafut", autonym: "Bafut", script: "Latn", languageCode: "bfd" };

/** basic_kbdus letters Bafut uses only in loanwords. */
const LOANWORD_SURPLUS = ["c", "p", "q", "v", "x"];

/** Walk from a fresh visitor to the alphabet screen, with Bafut's exemplars accepted. */
async function reachBafutAlphabet(page: Page): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, BAFUT);
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  // The copy track, deliberately: its project-name step is what writes the
  // language tag onto the working copy. The adapt track skips that step, so
  // the needed set never consults the exemplar index there and this walk
  // would pass whether or not loanword letters are counted as needed.
  await chooseTrackCopy(page);
  await acceptProjectName(page);
  await confirmPrefill(page);

  // The exemplar option is pre-selected asynchronously once the inventory
  // lookup settles; Continue before that would decline it.
  const exemplars = page.locator("#discovery_method-exemplars");
  await expect(exemplars).toBeChecked({ timeout: 30_000 });
  await page.click('[data-testid="phase-b-intro-next"]');
  await expect(page.getByTestId("phase-b-heading")).toContainText("Confirm your alphabet", {
    timeout: 15_000,
  });
}

/** From the alphabet screen, press Done and walk the steps between it and the convenience question. */
async function continueToConvenience(
  page: Page,
  expectConvenience: "shown" | "skipped" = "shown",
): Promise<void> {
  const done = page.getByTestId("phase-b-done");
  await expect(done).toBeEnabled();
  await done.click();
  // Bafut's main tier carries combining tone marks, so the marks series renders.
  await driveMarksSeries(page);
  await drivePunctuationStep(page);
  await driveInvisiblesStep(page);
  await driveConvenienceStep(page, { expect: expectConvenience });
}

/** The letters the convenience question offers, read from its checkbox labels ("Keep c C"). */
async function offeredLetters(page: Page): Promise<string[]> {
  const labels = await page
    .getByTestId("convenience-chars")
    .getByRole("checkbox")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return labels.map((l) => l.replace(/^Keep /, "").split(" ")[0] ?? "").sort();
}

test.describe("Convenience letters: loanword-only letters", () => {
  test("accept: loanword letters are shown unselected, and the question offers them", async ({
    page,
  }) => {
    await reachBafutAlphabet(page);

    // The alphabet screen shows the loanword tier, none of it selected.
    const loanwords = page.getByTestId("alphabet-loanwords");
    await expect(loanwords).toBeVisible();
    for (const ch of LOANWORD_SURPLUS) {
      const chip = loanwords.getByRole("button", { name: new RegExp(`^${ch} ${ch.toUpperCase()} `) });
      await expect(chip).toHaveAttribute("aria-pressed", "false");
    }

    await continueToConvenience(page);
    expect(await offeredLetters(page)).toEqual(LOANWORD_SURPLUS);

    await page.getByTestId("convenience-continue").click();
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 20_000 });
  });

  test("add one: a loanword letter added to the alphabet is not offered", async ({ page }) => {
    await reachBafutAlphabet(page);

    const q = page.getByTestId("alphabet-loanwords").getByRole("button", { name: /^q Q / });
    await q.click();
    await expect(q).toHaveAttribute("aria-pressed", "true");

    await continueToConvenience(page);
    expect(await offeredLetters(page)).toEqual(LOANWORD_SURPLUS.filter((ch) => ch !== "q"));
  });

  test("add all: with every loanword letter added, the question is skipped", async ({ page }) => {
    await reachBafutAlphabet(page);

    const toggleAll = page.getByTestId("alphabet-loanwords-toggle-all");
    await expect(toggleAll).toHaveText("Add all loanword letters");
    await toggleAll.click();
    await expect(toggleAll).toHaveText("Remove all loanword letters");
    for (const ch of LOANWORD_SURPLUS) {
      const chip = page
        .getByTestId("alphabet-loanwords")
        .getByRole("button", { name: new RegExp(`^${ch} ${ch.toUpperCase()} `) });
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    }

    await continueToConvenience(page, "skipped");
  });
});
