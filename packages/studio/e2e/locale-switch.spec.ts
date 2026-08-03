// E2E: locale-switch walk (spec 046 T033, US3).
//
// Proves the LocaleSwitcher (in the NavBar, present on every route — see
// StudioShell.tsx NavBar) actually flips rendered chrome to the translated
// catalog, persists the choice across a reload, and — per T039 — that a
// returning fr visitor never sees an English flash on first paint, because
// main.tsx now awaits lib/i18n.ts's `localeReady` before the first render.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test locale-switch.spec.ts

import { test, expect } from "playwright/test";
import { seedReturningVisitor, selectMenuOption } from "./helpers/surveyFlow";

// Scope everything to the NavBar landmark (aria-label="Studio navigation",
// StudioShell.tsx) — the survey's own language-identify question also has
// "language" in its accessible name/text, so an unscoped locator is ambiguous.
// The LocaleSwitcher's field label (<Trans>) is a bare text node next to the
// control, so within the nav a substring getByText is unambiguous (option text
// is each language's autonym — "English"/"Français" — which never contains
// "Language"/"Langue").
function navBar(page: import("playwright/test").Page) {
  return page.getByRole("navigation", { name: "Studio navigation" });
}

/**
 * Pick a UI locale.
 *
 * The switcher is a ui/SelectMenu (trigger `<button aria-haspopup="listbox">`
 * plus a DOM-rendered `<ul role="listbox">`), not a native `<select>` — native
 * popups don't open in the VS Code webview. So: open it, then click the option
 * by its `data-value` test hook. Same pattern as the survey's target-script and
 * host-key pickers in helpers/surveyFlow.ts; `selectOption()` cannot drive it.
 */
async function chooseLocale(
  page: import("playwright/test").Page,
  locale: "en" | "fr",
): Promise<void> {
  // Through the shared driver: SelectMenu portals its listbox to
  // document.body, so the option is not reachable through the trigger's
  // parent (see selectMenuOption's docstring).
  await selectMenuOption(page, navBar(page).locator("#nav-language-select"), locale);
}

test.describe("Locale switcher — persistence + no first-paint English flash", () => {
  test("switching to fr translates chrome and persists across reload", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    // English by default — the field label reads "Language".
    await expect(navBar(page).getByText("Language")).toBeVisible();

    await chooseLocale(page, "fr");

    // Same assertion LocaleSwitcher.test.tsx makes at the unit level
    // ("Language" -> "Langue"), here proving the real browser round-trip
    // (persist -> lazy catalog fetch -> i18n.activate) works too.
    await expect(navBar(page).getByText("Langue")).toBeVisible();

    // Persisted choice survives a reload, and — per T039 — is already active
    // at first paint (no separate waitFor needed for the flip: mountApp()
    // now awaits localeReady before rendering at all).
    await page.reload();
    await expect(navBar(page).getByText("Langue")).toBeVisible();

    // Switch back to English so this test leaves no locale side effect for
    // any spec that happens to reuse the browser context/storage state.
    await chooseLocale(page, "en");
    await expect(navBar(page).getByText("Language")).toBeVisible();
  });
});
