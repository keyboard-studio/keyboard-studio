// E2E: spec 113 (Layout Studio) T048 — US1 row.
//
// Copy a simple positional keyboard, open Mechanical Gallery -> Layout, and check that:
//   - the default-layer cells show the copied keyboard's characters, labelled "from the starting
//     point"; and
//   - a store-based key (an any()/index() rule) shows its read-only reason, and "view in code"
//     opens the Code tab with that rule revealed.
//
// Fixtures: basic_kbdus is a plain positional keyboard (no any()/index() rule). akha_lahu has a
// single `+ any(Input) > index(OutputU,1)` key rule, so it supplies the store-based key.
//
// Run:
//   cd packages/studio && npx playwright test layout-tab.spec.ts --project=desktop

import { test, expect, type Page } from "playwright/test";
import {
  driveIdentityLite,
  pickStartKeyboard,
  chooseTrackCopy,
  driveAttributionStep,
  acceptProjectName,
  confirmPrefill,
  buildOneCharacterList,
  driveDeadkeysStep,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

/** Walk identity -> copy a starting keyboard -> carve -> deadkeys -> rules, landing on the Mechanical Gallery. */
async function reachMechanicalGallery(
  page: Page,
  startKeyboardId: string,
  languageCode: string,
  charToAdd: string,
): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page, { languageCode });
  await pickStartKeyboard(page, startKeyboardId);
  await chooseTrackCopy(page);
  await driveAttributionStep(page, { authorName: "Test Author" });
  await acceptProjectName(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, charToAdd);

  await page.getByTestId("carve-gallery").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
  await driveDeadkeysStep(page);
  await page.getByTestId("rules-continue").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("rules-continue").click();

  await page.getByTestId("editor-view-tabs").waitFor({ state: "visible", timeout: 60_000 });
}

async function openLayoutTab(page: Page): Promise<void> {
  await page.getByTestId("editor-view-tab-layout").click();
  await expect(page.getByTestId("editor-view-panel-layout")).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 60_000 });
}

test.describe("spec 113 Layout tab - US1", () => {
  test.setTimeout(600_000);

  test("default layer shows the copied characters, labelled from the starting point", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "é");
    await openLayoutTab(page);

    // K_A's unshifted output on a US layout is "a", drawn from the copied keyboard.
    const cellA = page.getByTestId("layout-cell-K_A");
    await expect(cellA).toBeVisible();
    const name = (await cellA.getAttribute("aria-label")) ?? "";
    expect(name, "K_A's name gives key, default layer, character and provenance").toMatch(
      /^Key A, layer Default, types a \(U\+0061\).*From the starting point/,
    );
    await expect(cellA).toContainText("a");
    await expect(page.getByTestId("layout-cell-K_A-provenance")).toBeVisible();
  });

  test("a store-based key shows its read-only reason and view-in-code opens the Code tab", async ({ page }) => {
    await reachMechanicalGallery(page, "akha_lahu", "ahk", "é");
    await openLayoutTab(page);

    // Any grid cell the studio marks read-only because its rule is store-based.
    const readOnly = page.getByTestId("layout-cell-K_LBRKT-readonly");
    await expect(
      page.getByTestId("layout-cell-K_LBRKT"),
      "the default-layer `[` key carries the any()/index() rule",
    ).toHaveAttribute("aria-label", /layer Default/);
    await expect(readOnly, "akha_lahu has an any()/index() key rule, so some cell is read-only").toBeVisible();
    await readOnly.click();

    const reason = page.getByTestId("key-detail-reason");
    await expect(reason).toContainText(/picks its output from a list of characters/i);

    await page.getByTestId("key-detail-view-in-code").first().click();
    await expect(page.getByTestId("editor-view-tab-code")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    // The rule's line is selected: the selection band sits on the `+ any(Input) > index(...)` line.
    const ruleLine = page.locator(".monaco-editor .view-line").filter({ hasText: "any(Input)" });
    await expect(ruleLine).toBeVisible();
    const selected = page.locator(".monaco-editor .selected-text").first();
    await expect(selected, "view in code selects the rule's line").toBeVisible();
    const [lineBox, selBox] = [await ruleLine.boundingBox(), await selected.boundingBox()];
    expect(lineBox).not.toBeNull();
    expect(selBox).not.toBeNull();
    expect(Math.abs(selBox!.y - lineBox!.y), "selection is on the any(Input) rule line").toBeLessThan(lineBox!.height / 2);
  });
});
