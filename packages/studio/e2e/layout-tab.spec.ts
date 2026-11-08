// E2E: spec 113 (Layout Studio) T048 — US1 row; US2 (T070), US3 (T087) and US8 (T105) rows below.
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
    // The name says "not compiled yet" until the artifact compiles, so wait for it.
    await expect(cellA, "K_A's name gives key, default layer, character and provenance").toHaveAttribute(
      "aria-label",
      /^Key A, layer Default, types a \(U\+0061\).*From the starting point/,
      { timeout: 60_000 },
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
  // Monaco announces each search with the term it ran, so a count left over from the previous
  // term cannot satisfy this.
  await expect(page.getByRole("alert").filter({ hasText: `found for '${text}'` })).toHaveCount(1, {
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

test.describe("spec 113 Layout tab - US3", () => {
  test.setTimeout(600_000);

  test("make a key a deadkey, add three rows and the proposed space row; after-this-deadkey, the simulator and the download agree", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "é");
    await openLayoutTab(page);

    // The backquote key already types a character: the new trigger must still fire.
    await page.getByTestId("layout-cell-K_BKQUOTE").click();
    await page.getByTestId("key-edit-deadkey").check();
    // The spec 083 disclosure of what the key does on likely host layouts is shown.
    await expect(page.getByRole("region", { name: "What this trigger key does on likely host layouts" })).toBeVisible();
    await page.getByTestId("key-edit-confirm").click();

    // The new deadkey's table opens with the space row proposed.
    await expect(page.getByTestId("deadkey-table-panel")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("deadkey-table-space-proposal")).toBeVisible();

    for (const [base, result] of [
      ["e", "è"],
      ["a", "à"],
      ["o", "ò"],
    ] as const) {
      await page.getByTestId("deadkey-table-add-base").fill(base);
      await page.getByTestId("deadkey-table-add-result").fill(result);
      await page.getByTestId("deadkey-table-add").click();
    }
    await page.getByTestId("deadkey-table-space-confirm").click();
    await expect(page.getByTestId("deadkey-table-fanout-row")).toHaveCount(4);

    // "After this deadkey" shows the rows, as the simulator types them (one validation cycle).
    await page.getByTestId("deadkey-table-show-after").click();
    const after = page.getByTestId("after-context-view");
    await expect(after).toBeVisible();
    const typed = async (vkey: string): Promise<string> =>
      (await after.locator(`[data-vkey="${vkey}"] [data-testid="after-context-result"]`).first().textContent({ timeout: 60_000 })) ?? "";
    await expect.poll(() => typed("K_E"), { timeout: 60_000 }).toContain("è");
    expect(await typed("K_A")).toContain("à");
    expect(await typed("K_O")).toContain("ò");
    expect(await typed("K_SPACE")).toContain("`");

    // The download carries the rules. Output opens once the Mechanisms step is finished.
    await page.getByTestId("editor-view-tab-assign").click();
    const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
    if (await startButton.isVisible().catch(() => false)) await startButton.click();
    await driveMechanismsGallery(page, {});
    await navigateToOutput(page);
    const download = await triggerDownload(page);
    const zip = unzipSync(new Uint8Array(fs.readFileSync((await download.path())!)));
    const kmn = Object.entries(zip).find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "the download carries a .kmn").toBeDefined();
    const kmnText = new TextDecoder().decode(kmn![1]);
    expect(kmnText).toContain("@deadkey:");
    expect(kmnText).toMatch(/dk\([0-9a-f]{4}\) \+ any\(dk_[0-9a-f]{4}_bases\)/i);
    // The combination table: bases e, a, o and Space, giving è, à, ò and the accent itself.
    expect(kmnText).toMatch(/store\(dk_[0-9a-f]{4}_bases\) 'eao '/);
    expect(kmnText).toMatch(/store\(dk_[0-9a-f]{4}_output\) 'èàò`'/);
  });
});

/** Replace every match of `find` in the Code tab's editor through Monaco's own find/replace. */
async function codeReplaceAll(page: Page, find: string, replace: string): Promise<void> {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("Control+H");
  await page.locator(".monaco-editor .find-widget textarea.input").first().fill(find);
  await page.locator(".monaco-editor .find-widget .replace-part textarea.input").first().fill(replace);
  await page.keyboard.press("Control+Alt+Enter");
  await page.keyboard.press("Escape");
}

/** Leave the first match of `text` selected in the Code tab's editor. */
async function codeSelect(page: Page, text: string): Promise<void> {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("Control+F");
  await page.locator(".monaco-editor .find-widget textarea.input").first().fill(text);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
}

/** Click Apply and wait for the pane to settle on the applied text. */
async function codeApply(page: Page): Promise<void> {
  await expect(page.getByTestId("kmn-code-dirty")).toBeVisible();
  await page.getByTestId("kmn-code-apply").click();
  await expect(page.getByTestId("kmn-code-dirty")).toHaveCount(0, { timeout: 120_000 });
}

test.describe("spec 113 Layout tab - US8", () => {
  test.setTimeout(900_000);

  test("change, add and delete a rule in the Code tab; the download has exactly those changes and reload keeps them; errors record nothing", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "é");
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });

    // Change a rule, add a rule, delete a rule; each is its own Apply.
    await codeReplaceAll(page, "[K_E] > U+0065", "[K_E] > U+00E8");
    await codeApply(page);
    await codeSelect(page, "+ [K_Q] > U+0071");
    await page.keyboard.press("End");
    await page.keyboard.insertText("\n+ [CTRL K_Q] > U+00A4");
    await codeApply(page);
    await codeSelect(page, "+ [K_W] > U+0077");
    await page.keyboard.press("Delete");
    await codeApply(page);
    await expectCodeHas(page, "U+00E8");
    await expectCodeHas(page, "U+00A4");

    // A syntax error: Apply stays disabled and the issue is counted; nothing is recorded.
    await page.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\nstore(&NAME 'unterminated");
    await expect(page.getByTestId("kmn-code-issue-count")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kmn-code-apply")).toBeDisabled();
    await page.keyboard.press("Control+Z");
    await expect(page.getByTestId("kmn-code-issue-count")).toHaveCount(0, { timeout: 30_000 });

    // A compile error (a rule that jumps to a group that does not exist): refused at Apply.
    await codeSelect(page, "+ [K_Q] > U+0071");
    await page.keyboard.press("End");
    await page.keyboard.insertText("\n+ [K_Z] > use(nogroup)");
    await page.getByTestId("kmn-code-apply").click();
    await expect(page.getByTestId("kmn-code-apply-error")).toContainText("Not applied", { timeout: 120_000 });
    await page.keyboard.press("Control+Z");

    // The download has exactly the three changes. Output opens once the Mechanisms step is finished.
    await page.getByTestId("editor-view-tab-assign").click();
    await driveMechanismsGallery(page, {});
    await navigateToOutput(page);
    const download = await triggerDownload(page);
    const zip = unzipSync(new Uint8Array(fs.readFileSync((await download.path())!)));
    const kmn = Object.entries(zip).find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "the download carries a .kmn").toBeDefined();
    const kmnText = new TextDecoder().decode(kmn![1]);
    expect(kmnText).toContain("[K_E] > U+00E8");
    expect(kmnText).toContain("[CTRL K_Q] > U+00A4");
    expect(kmnText).not.toContain("[K_W] > U+0077");
    expect(kmnText).not.toContain("nogroup");
    expect(kmnText).toContain("[K_Q] > U+0071");

    // Reload keeps them.
    await page.reload();
    await page.getByRole("button", { name: /^Mechanisms —/ }).click({ timeout: 60_000 });
    await page.getByTestId("editor-view-tabs").waitFor({ state: "visible", timeout: 60_000 });
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    await expectCodeHas(page, "U+00E8");
    await expectCodeHas(page, "U+00A4");
  });

  test("overriding another editor's rule shows the owner confirm and a review flag, which Keep clears", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "é");

    // The Layout tab sets K_Q to ŋ (and Shift to Ŋ): a rule the Layout tab owns.
    await openLayoutTab(page);
    await page.getByTestId("layout-cell-K_Q").click();
    await page.getByTestId("key-edit-text").fill("ŋ");
    await page.getByTestId("key-edit-confirm").click();
    await expect(page.getByTestId("layout-cell-K_Q")).toHaveAttribute("aria-label", /ŋ/, { timeout: 60_000 });

    // The Code tab changes that rule's output; the owner confirm names the Layout tab.
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    await codeReplaceAll(page, "U+014B", "U+014C");
    await expect(page.getByTestId("kmn-code-dirty")).toBeVisible();
    await page.getByTestId("kmn-code-apply").click();
    await expect(page.getByTestId("kmn-code-owner-confirm")).toContainText("Layout tab", { timeout: 120_000 });
    await page.getByRole("button", { name: "Apply anyway" }).click();
    await expect(page.getByTestId("kmn-code-dirty")).toHaveCount(0, { timeout: 120_000 });

    // The review flag is listed and counted on the tab (announced as part of the tab's name).
    await expect(page.getByTestId("kmn-code-review-flag")).toHaveCount(1);
    await expect(page.getByTestId("editor-view-tab-code")).toHaveText("Code (1)");
    await expectCodeHas(page, "U+014C");

    // Keep clears the flag and leaves the code edit in effect.
    await page.getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("kmn-code-review-flag")).toHaveCount(0);
    await expect(page.getByTestId("editor-view-tab-code")).toHaveText("Code");
    await expectCodeHas(page, "U+014C");
  });
  // Ruling 9: the Assign tab's assignment wins over a code edit on the same key, in either order.
  // The edit is not applied in the download, and the author is told why.
  async function expectDownloadHasAssignmentNotEdit(page: Page): Promise<void> {
    await navigateToOutput(page);
    const download = await triggerDownload(page);
    const zip = unzipSync(new Uint8Array(fs.readFileSync((await download.path())!)));
    const kmn = Object.entries(zip).find(([name]) => name.endsWith(".kmn"));
    expect(kmn, "the download carries a .kmn").toBeDefined();
    const kmnText = new TextDecoder().decode(kmn![1]);
    expect(kmnText, "the assignment's rule is in the download").toMatch(/\[K_E\] > U\+014B/i);
    expect(kmnText, "the code edit on the replaced rule is not applied").not.toContain("U+00A4");
  }

  /** Leave the finished Mechanisms step and reopen it on its editor tabs. */
  async function reopenMechanisms(page: Page): Promise<void> {
    await page.getByRole("button", { name: /^Mechanisms —/ }).click({ timeout: 60_000 });
    await page.getByTestId("editor-view-tabs").waitFor({ state: "visible", timeout: 60_000 });
  }

  test("ruling 9: a code edit, then the key is assigned in the Assign tab; the edit is not applied and is flagged", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "ŋ");
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    await codeReplaceAll(page, "[K_E] > U+0065", "[K_E] > U+00A4");
    await codeApply(page);

    await page.getByTestId("editor-view-tab-assign").click();
    await driveMechanismsGallery(page, { placements: { "ŋ": { key: "K_E" } } });
    await expectDownloadHasAssignmentNotEdit(page);

    // Back in the Code tab the edit is listed with the reason, and counted on the tab.
    await reopenMechanisms(page);
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    const flag = page.getByTestId("kmn-code-review-flag");
    await expect(flag).toHaveCount(1, { timeout: 120_000 });
    await expect(flag).toContainText("could not be applied to the keyboard as built");
    await expect(page.getByTestId("editor-view-tab-code")).toHaveText("Code (1)");
  });

  // Pending a product decision. Ruling 9 says this order is also an FR-063 (b) review flag: the
  // edit is recorded, not applied in the download, and flagged. Today the Apply gate's projection
  // check (compileCandidateKmn "unplaceable") refuses the Apply instead: it shows "does not fit the
  // keyboard as it will be built", records nothing, and leaves the tab at "Code". Either amend
  // ruling 9 and scenario 4 to accept the refusal, or let the gate record an edit whose only miss is
  // a rule an assignment claims. Then flip this to `test`, or change its assertions.
  test.fixme("ruling 9: the key is assigned in the Assign tab, then edited in code; the edit is not applied and is flagged", async ({ page }) => {
    await reachMechanicalGallery(page, "basic_kbdus", "en", "ŋ");
    await page.getByTestId("editor-view-tab-assign").click();
    await driveMechanismsGallery(page, { placements: { "ŋ": { key: "K_E" } } });

    await reopenMechanisms(page);
    await page.getByTestId("editor-view-tab-code").click();
    await expect(page.getByTestId("kmn-code-pane")).toBeVisible({ timeout: 60_000 });
    await codeReplaceAll(page, "[K_E] > U+0065", "[K_E] > U+00A4");
    await codeApply(page);
    const flag = page.getByTestId("kmn-code-review-flag");
    await expect(flag).toHaveCount(1, { timeout: 120_000 });
    await expect(flag).toContainText("could not be applied to the keyboard as built");
    await expect(page.getByTestId("editor-view-tab-code")).toHaveText("Code (1)");
    await expectDownloadHasAssignmentNotEdit(page);
  });
});
