// E2E: spec 060 (crash reporting) — T033, FR-124, SC-008.
//
// THE PLAYWRIGHT HALF OF A TWO-LANE SPLIT (research D3).
//
// The structural assertions — which role, where focus lands, is the control a
// real button — live in the vitest lane
// (src/components/CrashRecoveryScreen.a11y.test.tsx). This spec exists for the
// one thing that lane structurally cannot do: run axe.
// `expectNoSeriousAxeViolations` has no vitest equivalent, and
// `@axe-core/playwright` is the repository's only axe dependency.
//
// WHY THE SCAN RUNS AGAINST THE REAL SURFACE, NOT A MOUNTED COPY. Contrast,
// focus-visible styling, and heading order are properties of the page as
// shipped — page CSS, real font stack, real surrounding landmarks. Rendering
// the component onto a scratch page would scan a different document from the
// one an author sees at the worst moment of their session. So the surfaces are
// driven through the flag-gated `window.__ksE2E__` hook, which exists only
// under `?e2e=1`.
//
// Run:
//   cd packages/studio && npx playwright test crash-recovery-a11y.spec.ts

import { test, expect } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const ISSUE_URL = "https://github.com/keyboard-studio/crash-reports/issues/42";

test.describe("crash surfaces — accessibility", () => {
  test("the recovery screen has no serious or critical axe violations", async ({
    page,
  }) => {
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);

    await page.evaluate(() => {
      window.__ksE2E__?.forceRenderCrash();
    });

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();

    await expectNoSeriousAxeViolations(page, "crash recovery screen");
  });

  test("focus lands on the recovery heading, not left on a detached node", async ({
    page,
  }) => {
    // Asserted here as well as in the jsdom lane because jsdom's focus model is
    // an approximation; this is the real browser confirming it.
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);
    await page.evaluate(() => {
      window.__ksE2E__?.forceRenderCrash();
    });

    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("the sent notice has no serious or critical axe violations", async ({
    page,
  }) => {
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);

    await page.evaluate(
      ([url, number]) => {
        window.__ksE2E__?.forceCrashNoticeSent(url as string, number as number);
      },
      [ISSUE_URL, 42] as const,
    );

    await expect(page.getByRole("link", { name: /report/i })).toBeVisible();

    await expectNoSeriousAxeViolations(page, "crash notice (report sent)");
  });

  test("the notice does not steal focus from the page", async ({ page }) => {
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined);

    // Park focus somewhere real, then raise the notice and confirm it stayed.
    await page.keyboard.press("Tab");
    const focusedBefore = await page.evaluate(
      () => document.activeElement?.outerHTML ?? "",
    );

    await page.evaluate(
      ([url, number]) => {
        window.__ksE2E__?.forceCrashNoticeSent(url as string, number as number);
      },
      [ISSUE_URL, 42] as const,
    );
    await expect(page.getByRole("link", { name: /report/i })).toBeVisible();

    const focusedAfter = await page.evaluate(
      () => document.activeElement?.outerHTML ?? "",
    );
    expect(focusedAfter).toBe(focusedBefore);
  });
});
