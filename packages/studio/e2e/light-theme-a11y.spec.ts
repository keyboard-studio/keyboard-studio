// Light-theme accessibility gate.
//
// boot-smoke.spec.ts runs axe against the DEFAULT theme, which is navy
// (index.html ships data-theme="navy" statically so navy paints with no
// flash). That left the light theme — introduced with the design-system
// token layer — completely unscanned, which is the worst place to have a
// blind spot: light is the theme nobody looks at, so a contrast failure
// there can sit unnoticed indefinitely.
//
// This is not hypothetical. The token migration produced two real contrast
// failures, and BOTH were worse on light than on navy:
//   - the phase stepper's inactive pills: 3.88:1 on navy, 2.92:1 on light
//   - a decorative [kb] glyph whose opacity had been tuned against the old
//     literal colours
// Only the navy numbers were caught by a gate. The light numbers were caught
// by hand-computing ratios, which does not scale and does not stay caught.
//
// Same screens and same helper as boot-smoke; the only difference is that the
// theme is forced to light before first paint.
import { test, expect } from "playwright/test";
import {
  seedReturningVisitor,
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  drivePunctuationStep,
} from "./helpers/surveyFlow";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

/**
 * Force the light theme before the app boots.
 *
 * main.tsx calls applyTheme(loadSavedTheme() ?? DEFAULT_THEME) BEFORE
 * createRoot, and lib/theme.ts reads the saved value from localStorage under
 * "ks.theme". Seeding that key via addInitScript therefore lands ahead of the
 * first paint — no toggle click, no re-render, no flash of navy to race.
 */
async function seedLightTheme(page: import("playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("ks.theme", "light");
    } catch {
      // Storage unavailable (private mode, blocked cookies) — the app falls
      // back to DEFAULT_THEME and this spec would then be scanning navy
      // twice. Asserted below rather than silently passing.
    }
  });
}

// Mirrors boot-smoke's ROOT_RENDERS, minus the dev-only lint demo (which that
// spec also excludes from its axe scan — the gate covers shipped screens).
const LIGHT_SCREENS = [
  { name: "app (light)", url: "/" },
  { name: "github oauth callback (light)", url: "/oauth/callback?code=bogus&state=bogus" },
  { name: "google oauth callback (light)", url: "/oauth/google/callback?code=bogus&state=bogus" },
];

for (const { name, url } of LIGHT_SCREENS) {
  test(`${name} has no serious axe violations`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await seedReturningVisitor(page);
    await seedLightTheme(page);
    await page.goto(url);

    await expect(page.locator("#root")).not.toBeEmpty();
    expect(pageErrors).toEqual([]);

    // Guard the premise: if the theme did not actually apply, this spec is
    // silently re-scanning navy and its green result means nothing. Assert the
    // attribute the token layer keys every colour off before trusting the scan.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await expectNoSeriousAxeViolations(page, name);
  });
}

// ---------------------------------------------------------------------------
// Deep walk — the screens above are the three root renders, which is where a
// theme bug is LEAST likely to hide: they are sparse. The dense screens are
// the base picker, the confirmation card, the character builder and the
// Discard gallery, and none of them are reachable without walking the survey.
//
// Scanning them on light is the automated form of "eyeball the light theme",
// and unlike an eyeball it stays checked. Same base keyboard and same
// marks-free character ("᙮", which auto-skips the marks step) that carve.spec
// uses, so this walk stays on the cheapest path to the gallery.
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bj_cree_woods";

/**
 * WCAG 1.4.3 (contrast) — Keyman Web paints its own spacebar caption inside the
 * OSK iframe with its own stylesheet. It is third-party framed content: the
 * studio supplies the keyboard, not that element's colours, and no `--app-*`
 * token reaches it.
 *
 * Excluded as a FRAME CHAIN (the ["iframe", …] form axe's own targets come back
 * in) rather than excluding the whole iframe, so the parts of the preview the
 * studio does control stay in scope. Same treatment, and same reason, as
 * carve.spec.ts's KNOWN_CONTRAST_DEBT.
 */
const KMW_FRAME_CONTRAST_DEBT: readonly (readonly string[])[] = [["iframe", ".kmw-spacebar-caption"]];

test("dense wizard screens have no serious axe violations on light", async ({ page }) => {
  test.slow(); // full survey walk plus four scans; the base picker alone enumerates ../keyboards

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await seedReturningVisitor(page);
  await seedLightTheme(page);
  await page.goto("/?e2e=1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // Identity questions, then the phase boundary into the base picker.
  await driveIdentityLite(page, { english: "Test", autonym: "Nehiyawewin", script: "other" });
  await expectNoSeriousAxeViolations(page, "base picker (light)");

  await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
  await chooseAdaptTrack(page);

  // "Confirm the basics" — the densest read-only surface in the flow, and the
  // one whose label/value colour pairs were most at risk from the token swap.
  await expectNoSeriousAxeViolations(page, "confirm the basics (light)", {
    exclude: KMW_FRAME_CONTRAST_DEBT,
  });

  await confirmPrefill(page);
  await expectNoSeriousAxeViolations(page, "characters (light)", {
    exclude: KMW_FRAME_CONTRAST_DEBT,
  });

  await buildOneCharacterList(page, "᙮");

  // Punctuation — a new spine step (main, post-#533) between the marks series
  // and convenience: unconditional, so it always renders. drivePunctuationStep
  // is a self-guarding no-op if the step isn't showing, so this is safe
  // regardless of manifest order. Without this call the walk stalled here and
  // the "discard gallery" wait below timed out waiting for a screen it could
  // never reach — not an app bug, this spec simply predated the step.
  await drivePunctuationStep(page);

  // Discard gallery — the character grid, the suggested-to-discard card with
  // its red top rule and red bulk button, and the details rail. The single
  // largest concentration of colour decisions in the app.
  await expect(page.getByTestId("carve-gallery")).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousAxeViolations(page, "discard gallery (light)", {
    exclude: KMW_FRAME_CONTRAST_DEBT,
  });

  expect(pageErrors).toEqual([]);
});
