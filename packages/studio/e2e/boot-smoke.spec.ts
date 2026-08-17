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
  // seed: false — WelcomeScreen is what a FIRST-time visitor sees;
  // seedReturningVisitor's whole purpose (every other entry below) is to
  // skip past it, so this is the one entry that must NOT seed.
  { name: "welcome screen", url: "/", axe: true, seed: false },
  { name: "app", url: "/", axe: true, seed: true },
  // Bogus code/state: the exchange fails, which is fine — we only care that
  // the screen renders (it shows its error state) instead of throwing.
  { name: "github oauth callback", url: "/oauth/callback?code=bogus&state=bogus", axe: true, seed: true },
  { name: "google oauth callback", url: "/oauth/google/callback?code=bogus&state=bogus", axe: true, seed: true },
  // Dashboard/profile tab (#1477 FR-009 audit — unscanned by any walk spec,
  // which all stay on the survey/preview/output/trail tabs).
  { name: "profile tab", url: "/#profile", axe: true, seed: true },
  // Dev-only demo route (/?demo=lint) — not production UI (same scoping as
  // the lingui unlocalized-string scan in eslint.config.mjs); the spec 056
  // accessibility gate covers shipped screens only.
  { name: "lint demo", url: "/?demo=lint", axe: false, seed: true },
];

for (const { name, url, axe, seed } of ROOT_RENDERS) {
  test(`${name} boots without an uncaught error`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    if (seed) {
      await seedReturningVisitor(page);
    }
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
