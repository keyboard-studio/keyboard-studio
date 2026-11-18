/**
 * The journey's marks live in the footer's Contents list (JourneyContents),
 * a modal sheet, on every viewport. These helpers open it, hand the sheet to
 * the caller, and close it again so the page underneath is usable.
 */

import { expect, type Locator, type Page } from "playwright/test";

export const contentsSheet = (page: Page): Locator => page.getByTestId("journey-contents-sheet");

/** Open the Contents list (no-op when it is already open) and return the sheet. */
export async function openContents(page: Page): Promise<Locator> {
  const sheet = contentsSheet(page);
  if (!(await sheet.isVisible())) {
    await page.getByTestId("journey-contents-open").click();
  }
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  return sheet;
}

/** Close the Contents list if it is open (a mark that arrives closes it itself). */
export async function closeContents(page: Page): Promise<void> {
  const sheet = contentsSheet(page);
  if (await sheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });
  }
}

/** Run `fn` against the open Contents list, then close it. */
export async function withContents<T>(page: Page, fn: (sheet: Locator) => Promise<T>): Promise<T> {
  const sheet = await openContents(page);
  try {
    return await fn(sheet);
  } finally {
    await closeContents(page);
  }
}
