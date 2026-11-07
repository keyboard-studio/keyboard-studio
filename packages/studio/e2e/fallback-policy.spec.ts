// E2E: the keyboard-wide fallback policy (spec 076, issue #2539).
//
// The policy is its own full-step screen after Assign Mechanisms (not a collapsed
// panel). This spec walks to that step, chooses each option, and checks the
// choice sticks. Carve still has no fallback control.
//
// Run: cd packages/studio && npx playwright test fallback-policy.spec.ts

import { test, expect } from "playwright/test";
import {
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  acceptProjectName,
  driveAttributionStep,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  driveMechanismsGallery,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

const START_KEYBOARD_ID = "bj_cree_woods";

const DO_NOTHING = "Do nothing";
const USE_COMPUTER = "Use the computer's layout";

test.describe("Fallback policy (keyboard-wide)", () => {
  test("is absent from the carve gallery and chooses each policy on the fallback step", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, { english: "Test", autonym: "Nehiyawewin", script: "other" });
    await pickStartKeyboard(page, START_KEYBOARD_ID);
    await chooseTrackCopy(page);
    await driveAttributionStep(page);
    await acceptProjectName(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fallback-policy-section")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toHaveCount(0);
    await expect(page.getByTestId("review-carved-keys-button")).toBeVisible();

    await page.getByTestId("carve-continue").click();
    await driveDeadkeysStep(page);
    await page.getByTestId("rules-continue").click();

    await driveMechanismsGallery(page);

    await expect(page.getByTestId("fallback-policy-step")).toBeVisible({ timeout: 30_000 });
    const section = page.getByTestId("fallback-policy-section");
    await expect(section).toBeVisible();
    await expect(page.locator("summary").filter({ hasText: "When a key" })).toHaveCount(0);

    const group = page.getByRole("group", { name: "Undefined keys: allow or block" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toBeChecked();
    await expect(page.getByTestId("fallback-policy-deadkey-rule")).toContainText(
      "Deadkey combinations always do nothing",
    );
    await expect(page.getByTestId("fallback-host-caption")).toContainText("best guess");

    await page.getByRole("radio", { name: USE_COMPUTER }).check();
    await expect(page.getByRole("radio", { name: USE_COMPUTER })).toBeChecked();

    await page.getByRole("radio", { name: DO_NOTHING }).check();
    await expect(page.getByRole("radio", { name: DO_NOTHING })).toBeChecked();

    await page.getByRole("radio", { name: USE_COMPUTER }).check();
    await expect(page.getByRole("radio", { name: USE_COMPUTER })).toBeChecked();

    await page.getByTestId("fallback-policy-continue").click();
  });
});
