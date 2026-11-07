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
  driveMechanismsGallery,
  seedReturningVisitor,
  navigateToOutput,
  triggerDownload,
} from "./helpers/surveyFlow";
import { unzipSync } from "fflate";
import * as fs from "node:fs";

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

/**
 * Monaco renders only the lines in view, so a rule further down is not in the DOM. Search the
 * whole model through the editor's own find widget and expect at least one match.
 */
async function expectCodeHas(page: Page, text: string): Promise<void> {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("Control+F");
  await page.locator(".monaco-editor .find-widget textarea").first().fill(text);
  await expect(page.locator(".monaco-editor .find-widget .matchesCount")).toHaveText(/^\d+ of \d+$/, {
    timeout: 60_000,
  });
  await page.keyboard.press("Escape");
}

test.describe("spec 113 Layout tab - US2", () => {
  test.setTimeout(600_000);

  test("assign eng and accept its capital in one confirm; both tabs, the download, undo and reload agree", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "é");
    await openLayoutTab(page);

    // Interaction 1: select the key. Interaction 2: enter the text. Interaction 3: confirm.
    await page.getByTestId("layout-cell-K_Q").click();
    await page.getByTestId("key-edit-text").fill("ŋ");
    await expect(page.getByTestId("key-edit-preview")).toContainText("ŋ");
    // The case partner (the capital on Shift) is proposed and accepted by default.
    await expect(page.getByTestId("key-edit-partner")).toContainText("Ŋ");
    // The default also keeps the displaced "q" on AltGr: one confirm, still one undo.
    await page.getByTestId("key-edit-confirm").click();

    // The Layout tab shows both once the keyboard recompiles (one validation cycle).
    await expect(page.getByTestId("layout-cell-K_Q")).toHaveAttribute("aria-label", /ŋ/, { timeout: 60_000 });

    // The Code tab shows both rules.
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    await expectCodeHas(page, "U+014B");
    await expectCodeHas(page, "U+014A");

    // The Assign tab labels the key as set in the Layout tab.
    await page.getByTestId("editor-view-tab-assign").click();
    // The gallery opens on its one-time intro until the author starts it.
    const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
    if (await startButton.isVisible().catch(() => false)) await startButton.click();
    await expect(page.getByTestId("assign-layout-edited-keys")).toContainText(/set in the Layout tab/i);

    // The downloaded source has both rules. Output opens once the Mechanisms step is finished.
    await driveMechanismsGallery(page, {});
    await navigateToOutput(page);
    const download = await triggerDownload(page);
    const zip = unzipSync(new Uint8Array(fs.readFileSync((await download.path())!)));
    const kmn = Object.entries(zip).find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "the download carries a .kmn").toBeDefined();
    const kmnText = new TextDecoder().decode(kmn![1]);
    expect(kmnText).toContain("U+014B");
    expect(kmnText).toContain("U+014A");

    // Reload keeps the edit: the decision persisted with the draft.
    await page.reload();
    await page.getByRole("button", { name: /^Mechanisms —/ }).click({ timeout: 60_000 });
    await page.getByTestId("editor-view-tabs").waitFor({ state: "visible", timeout: 60_000 });
    await openLayoutTab(page);
    await expect(page.getByTestId("layout-cell-K_Q")).toHaveAttribute("aria-label", /ŋ/, { timeout: 60_000 });

    // One undo removes both rules.
    await page.getByTestId("layout-undo").click();
    await expect(page.getByTestId("layout-cell-K_Q")).not.toHaveAttribute("aria-label", /ŋ/, { timeout: 60_000 });
    await page.getByTestId("layout-cell-K_Q").click();
    await page.getByTestId("layout-undo").waitFor();
    await expect(page.getByTestId("layout-undo")).toBeDisabled();
  });
});
