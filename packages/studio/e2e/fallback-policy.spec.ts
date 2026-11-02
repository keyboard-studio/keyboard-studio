// E2E: fallback to the base keyboard (spec 109 US1; spec 076 fallback surface).
//
// The surface lives in a collapsible section at the bottom of the Assign
// Mechanisms step (interim host) and never in the carve gallery. This spec
// copies `sil_cameroon_qwerty` with UK English as the typists' base keyboard,
// walks to the section, reads the per-base-keyboard leak list, and confirms a
// per-class choice.
//
// What `sil_cameroon_qwerty` leaves unhandled: only the ISO key left of Z
// (K_OE2). AltGr+4 is NOT unhandled there: the keyboard binds `RALT K_4`
// to BEEP, so it consumes the key and the UK English euro never leaks. The
// euro-on-AltGr+4 case from the spec is covered by the component test, which
// uses a keyboard that does leave that position unbound.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test fallback-policy.spec.ts

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickStartKeyboard,
  chooseAdaptTrack,
  driveAttributionStep,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const START_KEYBOARD_ID = "sil_cameroon_qwerty";
const UK_LAYOUT_ID = "basic_kbduk";

const DO_NOTHING = "Do nothing";
const USE_COMPUTER = "Use the computer's layout";

/** From the base-keyboard picker, step back to the layout step and pick UK English. */
async function pickUkLayout(page: Page): Promise<void> {
  const layoutStep = page.getByTestId("layout-step");
  await page.getByTestId("base-back").click();
  await expect(layoutStep).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("layout-picker-input").click();
  await expect(page.getByTestId("layout-picker-list")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`layout-option-${UK_LAYOUT_ID}`).click();
  await page.getByTestId("layout-continue").click();
}

test.describe("Fallback to the base keyboard", () => {
  test("is absent from the carve gallery; lists the UK English leaks and confirms a per-class choice in Assign Mechanisms", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, { english: "Test", autonym: "Test Autonym", script: "other" });
    await pickUkLayout(page);
    await pickStartKeyboard(page, START_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await driveAttributionStep(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    // Carve gallery: a plain review exists, but no fallback control.
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fallback-policy-section")).toHaveCount(0);
    await expect(page.getByTestId("review-carved-keys-button")).toBeVisible();

    await page.getByTestId("carve-continue").click();
    await driveDeadkeysStep(page);
    await page.getByTestId("rules-continue").click();

    // Assign Mechanisms: the section is there, collapsed, naming the base keyboard and the per-class counts.
    const section = page.getByTestId("fallback-policy-section");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fallback-policy-title")).toContainText("United Kingdom");
    await expect(page.getByTestId("fallback-summary-punctuation")).toContainText("type something on United Kingdom");

    await section.locator("summary").click();

    // The UK English list: the unhandled ISO key types a backslash, and a picked
    // base keyboard means no "studio's guess" caption.
    await expect(page.getByTestId(`fallback-list-${UK_LAYOUT_ID}`)).toBeVisible();
    await expect(page.getByTestId(`fallback-leak-${UK_LAYOUT_ID}--K_OE2`)).toContainText("\\");
    await expect(page.getByTestId("fallback-host-caption")).toHaveCount(0);

    // Nothing applies until confirmed; the Do nothing copy says what it covers today or after confirming.
    await expect(page.getByTestId("fallback-policy-status")).toContainText("proposals");
    const letters = page.getByTestId("fallback-class-letters");
    await expect(letters.getByTestId("fallback-desc-letters-swallow")).toContainText("not covered yet");

    // The Latin proposals pass through. Choosing Do nothing for letters confirms and changes only that class.
    await expect(letters.getByRole("radio", { name: USE_COMPUTER })).toBeChecked();
    await letters.getByRole("radio", { name: DO_NOTHING }).check();
    await expect(page.getByTestId("fallback-policy-status")).toContainText("You confirmed");
    await expect(letters.getByRole("radio", { name: DO_NOTHING })).toBeChecked();
    await expect(page.getByTestId("fallback-class-digits").getByRole("radio", { name: USE_COMPUTER })).toBeChecked();

    // Confirmed with a Do nothing class: the copy now claims what the compiled keyboard does.
    await expect(letters.getByTestId("fallback-desc-letters-swallow")).toContainText("Silent on every computer");

    // The deadkey rule is stated, not offered.
    await expect(page.getByTestId("fallback-policy-deadkey-rule")).toContainText(
      "Deadkey combinations always do nothing",
    );
  });
});
