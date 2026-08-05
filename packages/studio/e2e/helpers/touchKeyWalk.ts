// Shared prelude for the spec 058 touch-key-editor walk specs — the survey
// navigation that has to happen before the By-key grid exists at all.
//
// Extracted for the Phase 10 conformance specs (T123 grid a11y, T124 mode
// toggle), which need the IDENTICAL prelude. `touch-key-assign.spec.ts` (T089)
// and `touch-key-add-remove.spec.ts` (T112) each keep their own file-local
// copies — the precedent the touch-derivation specs set, and not worth
// disturbing shipped specs to unify. Two MORE copies, however, is where
// duplication stops being precedent and starts being a maintenance bill, so
// the new pair share this module instead.
//
// Fixture: bambara (Mande, Mali — see docs/keyboard-index.md), the same base
// every other touch spec uses, so a fixture change is noticed in one place.

import { expect, type Page } from "playwright/test";
import {
  driveIdentityLite as driveIdentityLiteBase,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  seedReturningVisitor,
} from "./surveyFlow";

export const BASE_KEYBOARD_ID = "bambara";

/**
 * The one Phase B character this walk adds, and its derived uppercase
 * counterpart. Deliberately atomic (no NFD decomposition), so Phase B's
 * marks-series gate never fires — see `touch-key-assign.spec.ts`'s fuller
 * note on why a decomposable letter would drag in unrelated machinery.
 */
export const PLACED_CHAR = "ø";
export const PLACED_CHAR_UPPER = "Ø";
const PLACED_CHAR_HOST_KEY = "K_W";
const PLACED_CHAR_UPPER_HOST_KEY = "K_X";

/** Which seed branch the touch_seed_source fork should take. */
export type TouchSeedChoice = "reseed" | "import-adapt";

async function driveIdentityLite(page: Page): Promise<void> {
  await driveIdentityLiteBase(page, {
    english: "Test",
    autonym: "Bamanankan",
    script: "Latn",
  });
  await expect(page.getByTestId("base-picker")).toBeVisible({ timeout: 15_000 });
}

/** Carve gallery — nothing is carved; these specs are not about the carve. */
async function skipCarve(page: Page): Promise<void> {
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("carve-continue").click();
}

/**
 * Places one Mechanisms character on a Right-Alt layer + `hostKey`. bambara's
 * `.kmn` covers the whole base US layout, so a new character has no free
 * zero-layer key and must go on an AltGr layer; neither host key below is one
 * bambara's own RALT rules use.
 */
async function placeMechanismCharacter(
  page: Page,
  char: string,
  hostKey: string,
): Promise<void> {
  const applyButton = page.getByRole("button", { name: `Apply method for ${char}` });
  await expect(applyButton).toBeVisible({ timeout: 15_000 });
  if (await applyButton.isDisabled()) {
    await page.getByRole("button", { name: "Add another layer" }).click();
    await page.getByRole("button", { name: "Layer 1 for layer-switch combo" }).click();
    await page.locator('ul[role="listbox"]').locator('li[data-value="RALT"]').click();
    await page.getByRole("button", { name: "Physical key for Assign to a key" }).click();
    await page.locator('ul[role="listbox"]').locator(`li[data-value="${hostKey}"]`).click();
  }
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
}

/** Mechanisms gallery (Phase C) — completing it is what locks the desktop. */
async function driveMechanisms(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the mechanism gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
  await placeMechanismCharacter(page, PLACED_CHAR, PLACED_CHAR_HOST_KEY);
  await page.getByRole("button", { name: /^(Next character|Done)$/ }).click();
  await placeMechanismCharacter(page, PLACED_CHAR_UPPER, PLACED_CHAR_UPPER_HOST_KEY);
  await page.getByRole("button", { name: /^(Next character|Done)$/ }).click();
}

/**
 * touch_seed_source fork. bambara's own default is "Import & adapt" (it ships
 * a usable layout), so `"reseed"` clicks through explicitly and
 * `"import-adapt"` just confirms the default.
 */
async function chooseTouchSeed(page: Page, choice: TouchSeedChoice): Promise<void> {
  await expect(page.getByTestId("seed-source-preview")).toBeVisible({ timeout: 15_000 });
  if (choice === "reseed") {
    const reseed = page.getByTestId("seed-source-reseed");
    await reseed.click();
    await expect(reseed).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByTestId("seed-source-confirm").click();
}

/** Dismisses the touch gallery's one-time intro splash, if it is showing. */
export async function dismissTouchIntro(page: Page): Promise<void> {
  const startButton = page.getByRole("button", { name: "Start the touch gallery" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
}

/** Switch to By-key mode and wait for the grid. */
export async function enterTouchKeyMode(page: Page): Promise<void> {
  await dismissTouchIntro(page);
  await page.getByTestId("touch-mode-tab-key").click();
  await expect(page.getByTestId("key-grid")).toBeVisible({ timeout: 15_000 });
}

/**
 * Everything from a cold browser up to the touch step, stopping BEFORE any
 * mode choice — the caller decides whether to enter By-key mode, so a spec
 * about the character pane can use the same prelude.
 */
export async function driveToTouchStep(
  page: Page,
  choice: TouchSeedChoice = "reseed",
): Promise<void> {
  await seedReturningVisitor(page);
  await page.goto("/");
  await driveIdentityLite(page);
  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);
  await confirmPrefill(page);
  await buildOneCharacterList(page, PLACED_CHAR);
  await skipCarve(page);
  await driveMechanisms(page);
  await chooseTouchSeed(page, choice);
  await dismissTouchIntro(page);
}

/** `driveToTouchStep` plus the By-key mode switch. */
export async function driveToTouchKeyMode(
  page: Page,
  choice: TouchSeedChoice = "reseed",
): Promise<void> {
  await driveToTouchStep(page, choice);
  await enterTouchKeyMode(page);
}
