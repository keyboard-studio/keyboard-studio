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
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const ROOT_RENDERS = [
  { name: "app", url: "/", axe: true },
  // Bogus code/state: the exchange fails, which is fine — we only care that
  // the screen renders (it shows its error state) instead of throwing.
  { name: "github oauth callback", url: "/oauth/callback?code=bogus&state=bogus", axe: true },
  { name: "google oauth callback", url: "/oauth/google/callback?code=bogus&state=bogus", axe: true },
  // Dev-only demo route (/?demo=lint) — not production UI (same scoping as
  // the lingui unlocalized-string scan in eslint.config.mjs); the spec 056
  // accessibility gate covers shipped screens only.
  { name: "lint demo", url: "/?demo=lint", axe: false },
];

for (const { name, url, axe } of ROOT_RENDERS) {
  test(`${name} boots without an uncaught error`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await seedReturningVisitor(page);
    await page.goto(url);

    await expect(page.locator("#root")).not.toBeEmpty();
    expect(pageErrors).toEqual([]);

    // Accessibility gate (spec 056 FR-003): every production screen this
    // suite can reach without the ../keyboards corpus gets an axe scan.
    if (axe) {
      await expectNoSeriousAxeViolations(page, name);
    }
  });
}
