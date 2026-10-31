// E2E: the keyboard-wide fallback policy (spec 076, fallback-surface-design.md).
//
// The policy lives in a collapsible section at the bottom of the Assign
// Mechanisms step (interim host) and never in the carve gallery. This spec
// walks to each place, then chooses each option and checks the choice sticks.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test fallback-policy.spec.ts

import { test, expect } from "playwright/test";
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

const START_KEYBOARD_ID = "bj_cree_woods";

const DO_NOTHING = "Do nothing";
const USE_COMPUTER = "Use the computer's layout";

test.describe("Fallback policy (keyboard-wide)", () => {
  test("is absent from the carve gallery and chooses each policy in Assign Mechanisms", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, { english: "Test", autonym: "Nehiyawewin", script: "other" });
    await pickStartKeyboard(page, START_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await driveAttributionStep(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    // Carve gallery: a plain review exists, but no fallback control.
    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fallback-policy-section")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toHaveCount(0);
    await expect(page.getByTestId("review-carved-keys-button")).toBeVisible();

    await page.getByTestId("carve-continue").click();
    await driveDeadkeysStep(page);
    await page.getByTestId("rules-continue").click();

    // Assign Mechanisms: the section is there, collapsed, naming the default.
    const section = page.getByTestId("fallback-policy-section");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fallback-policy-current")).toHaveText(DO_NOTHING);

    await section.locator("summary").click();
    const group = page.getByRole("group", { name: "When a key isn't in your keyboard" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toBeChecked();
    await expect(page.getByTestId("fallback-policy-deadkey-rule")).toContainText(
      "Deadkey combinations always do nothing",
    );
    await expect(page.getByTestId("fallback-host-caption")).toContainText("best guess");

    // Each option, in turn.
    await page.getByRole("radio", { name: USE_COMPUTER }).check();
    await expect(page.getByRole("radio", { name: USE_COMPUTER })).toBeChecked();
    await expect(page.getByTestId("fallback-policy-current")).toHaveText(USE_COMPUTER);

    await page.getByRole("radio", { name: DO_NOTHING }).check();
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toBeChecked();
    await expect(page.getByTestId("fallback-policy-current")).toHaveText(DO_NOTHING);

    // The choice is a stored setting, not disclosure state: collapse and
    // reopen the section and it stands.
    await page.getByRole("radio", { name: USE_COMPUTER }).check();
    await section.locator("summary").click();
    await expect(page.getByTestId("fallback-policy-current")).toHaveText(USE_COMPUTER);
    await section.locator("summary").click();
    await expect(page.getByRole("radio", { name: USE_COMPUTER })).toBeChecked();
  });
});
