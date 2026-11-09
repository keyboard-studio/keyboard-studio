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
  // The New-or-Open choice (spec 111).
  { name: "start screen", url: "/#start", axe: true, seed: true },
];

for (const { name, url, axe, seed } of ROOT_RENDERS) {
  test(`${name} boots without an uncaught error`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    if (seed) {
      await seedReturningVisitor(page);
    }
    await page.goto(url);

    // 30s paint budget per paint (was: the 5s expect default). The OAuth
    // callbacks boot TWICE — the callback screen paints, the bogus-code
    // exchange fails, and location.replace() lands a full second app boot —
    // so one window cannot span both paints (#2095).
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 30_000 });

    if (url.includes("/oauth/")) {
      await page.waitForURL((u) => !u.pathname.includes("/oauth/"), {
        timeout: 30_000,
      });
      await expect(page.locator("#root")).not.toBeEmpty({ timeout: 30_000 });
    }

    expect(pageErrors).toEqual([]);

    // Accessibility gate (spec 056 FR-003): every production screen this
    // suite can reach without the ../keyboards corpus gets an axe scan.
    if (axe) {
      await expectNoSeriousAxeViolations(page, name);
    }
  });
}

// Spec 111 FR-001: after "Continue as guest" the author chooses New or Open, both
// on screen. toBeInViewport, not toBeVisible: Playwright counts an element
// clipped below an overflow:hidden pane as visible, which is how the Open entry
// once shipped unreachable. The nav wordmark leads back to the choice.
test("guest reaches New and Open, and the wordmark leads back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByTestId("start-new")).toBeInViewport({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: /open an existing keyboard/i })).toBeInViewport();

  await page.getByTestId("start-new").click();
  await expect(page).toHaveURL(/#survey/);
  await page.getByRole("link", { name: "Keyboard Studio" }).click();
  await expect(page.getByTestId("start-new")).toBeInViewport({ timeout: 30_000 });
});
