// Boot smoke — every tree main.tsx can mount must paint without a page error.
//
// Regression guard for the blank-page crash: the <I18nProvider> lived inside
// StudioShell (which also called useLingui(), so it never saw its own
// provider), and the two other root renders — the OAuth callback screen and
// the lint demo — had no provider at all. All three threw on first paint.
// The provider now lives in AppRoot, above every createRoot() render.
//
// Cheap by design: each case asserts "no uncaught error, #root is not empty".
import { test, expect } from "playwright/test";
import { seedReturningVisitor } from "./helpers/surveyFlow";

const ROOT_RENDERS = [
  { name: "app", url: "/" },
  // Bogus code/state: the exchange fails, which is fine — we only care that
  // the screen renders (it shows its error state) instead of throwing.
  { name: "github oauth callback", url: "/oauth/callback?code=bogus&state=bogus" },
  { name: "google oauth callback", url: "/oauth/google/callback?code=bogus&state=bogus" },
  { name: "lint demo", url: "/?demo=lint" },
];

for (const { name, url } of ROOT_RENDERS) {
  test(`${name} boots without an uncaught error`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await seedReturningVisitor(page);
    await page.goto(url);

    await expect(page.locator("#root")).not.toBeEmpty();
    expect(pageErrors).toEqual([]);
  });
}
