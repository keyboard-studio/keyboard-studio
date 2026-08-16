/**
 * E2E (GATING — spec 057 FR-080, US1): leaving a tab and coming back must land
 * the author exactly where they were.
 *
 * This spec is written to FAIL against the pre-fix tree and to pass after it.
 * The defect it pins is D-1: `SurveyView`'s mount-time
 * `useSurveySessionStore.getState().reset()` treats a component remount as the
 * start of a new wizard session, so every top-level tab round trip silently
 * throws the walk back to the identity step. Two of its cascades are pinned
 * here as well:
 *
 *   - D-3 — the walked `history` goes with the position, so in-app Back stops
 *     reaching the step the author actually came from.
 *   - D-4 — `charactersSubStage` resets to "prefill", so re-confirming prefill
 *     re-fires `resetPhaseBDraft()` and the Phase B alphabet the author had
 *     built is silently emptied.
 *
 * Every tab switch goes through the ONE shared `switchTab` step driver
 * (FR-082) — no inline hash assignment lives in this file.
 *
 * Not `.skip`-ped, ever (FR-083).
 */

import { test, expect } from "playwright/test";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  seedReturningVisitor,
  switchTab,
  type TabRoute,
} from "./helpers/surveyFlow";
import { expectNoSeriousAxeViolations } from "./helpers/axe";

const FIXTURE = {
  baseKeyboardId: "basic_kbdfr",
  autonym: "Test Autonym",
  english: "Test",
  targetScript: "other",
};

/**
 * The four tabs that are NOT the wizard. `flowmap` is dev-gated
 * (`SHOW_FLOWMAP`) but `pnpm dev` — which is what these specs run against —
 * always has it, so all four are exercised.
 */
const OTHER_TABS: readonly TabRoute[] = ["preview", "output", "trail", "flowmap"];

/**
 * #1477's ground-truth sweep (live axe run with this list emptied, across
 * the preview/output/trail tabs) found PickerPane's source-mode toggle and
 * SignUpPanel's GitHub button — the two entries this list used to carry —
 * already clean. The remaining OSK iframe entry is now also fixed at the
 * source (packages/studio/public/osk-frame.html overrides
 * `.kmw-spacebar-caption`'s color), so this scan now covers everything the
 * frame renders. Kept as an empty array so `exclude: KNOWN_CONTRAST_DEBT`
 * below keeps compiling.
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [];

/**
 * Tabs the axe scan runs on.
 *
 * `flowmap` is deliberately absent. It is a DEVELOPER AID, not an
 * author-facing surface — it renders only in `vite dev` or behind
 * `VITE_SHOW_FLOWMAP=1` (see `SHOW_FLOWMAP` in StudioShell.tsx) — and it
 * carries broad pre-existing 1.4.3 and scrollable-region debt of its own.
 * Scanning it here would import that debt into this feature's gate and would
 * need node-by-node exclusions covering most of the screen, which is a scan
 * that no longer asserts anything.
 *
 * The ROUND TRIP is still exercised through `flowmap` below — only the a11y
 * scan is scoped. Spec 056 owns the Flow Map's own conformance.
 */
const AXE_SCANNED_TABS: ReadonlySet<TabRoute> = new Set<TabRoute>([
  "preview",
  "output",
  "trail",
]);

test.describe("tab round trip preserves the author's position (spec 057 US1)", () => {
  test.beforeEach(async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/");
  });

  test("mid-walk position, history and Phase B alphabet survive every tab round trip", async ({
    page,
  }) => {
    // ---- Walk to a mid-flow step -------------------------------------------
    // identity -> choose_base -> track -> characters (the adapt track skips
    // project_name; see steps/manifest.ts's track-routing docstring).
    await driveIdentityLite(page, {
      english: FIXTURE.english,
      autonym: FIXTURE.autonym,
      script: FIXTURE.targetScript,
    });
    await pickBaseKeyboard(page, FIXTURE.baseKeyboardId);
    await chooseAdaptTrack(page);

    const prefillConfirm = page.getByTestId("prefill-confirm");
    await expect(prefillConfirm).toBeVisible({ timeout: 30_000 });

    // The axe scans below cover the TABS this spec navigates between — the
    // surfaces this feature actually touches. The wizard's own step screens
    // are deliberately not scanned here: the prefill summary carries a
    // pre-existing 1.4.3 (Contrast Minimum) failure on its derived-value
    // rows, which is spec 056's open tracker row (`1.4.3 … unknown`), not
    // anything spec 057 introduces. Gating this feature's red/green evidence
    // on unrelated a11y debt would make the gate say something it does not
    // mean.

    // ---- Round trip through each other tab ---------------------------------
    for (const tab of OTHER_TABS) {
      await switchTab(page, tab);
      if (AXE_SCANNED_TABS.has(tab)) {
        await expectNoSeriousAxeViolations(page, `tab: ${tab}`, {
          exclude: KNOWN_CONTRAST_DEBT,
        });
      }

      await switchTab(page, "survey");

      // FR-002: the same step is on screen. Pre-fix the mount reset has
      // dropped the walk back to identity-lite, so #il_language_english is
      // showing instead and this assertion is the red one.
      await expect(prefillConfirm, `returned from #${tab} to a different step`).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator("#il_language_english")).toHaveCount(0);
    }

    // ---- In-app Back still reaches the step we came from (D-3) -------------
    // `history` is part of the traversal state a reset destroys; StepHost only
    // renders the Back affordance while `expectedBackTarget` is non-null, so a
    // cleared history makes this control disappear outright.
    const backButton = page.getByRole("button", { name: /back/i }).first();
    await expect(backButton, "in-app Back is gone — walked history was reset").toBeVisible({
      timeout: 10_000,
    });
    await backButton.click();
    await expect(page.getByTestId("track-adapt")).toBeVisible({ timeout: 20_000 });

    // Forward again, so the alphabet half of the test starts from characters.
    await chooseAdaptTrack(page);
    await expect(prefillConfirm).toBeVisible({ timeout: 20_000 });

    // ---- The Phase B draft alphabet survives a round trip (D-4) ------------
    await confirmPrefill(page);
    await page.waitForSelector('[data-testid="phase-b-intro-next"]', { timeout: 20_000 });
    await page.click('[data-testid="phase-b-intro-next"]');

    const charInput = page.getByLabel("Character to add");
    await charInput.waitFor({ timeout: 15_000 });
    await charInput.fill("é");
    await page.getByRole("button", { name: "+ Add" }).click();

    const authoredChips = page.getByTestId("authored-char-chip");
    await expect(authoredChips.first()).toBeVisible({ timeout: 10_000 });
    const chipCountBefore = await authoredChips.count();
    expect(chipCountBefore).toBeGreaterThan(0);

    await switchTab(page, "preview");
    await switchTab(page, "survey");

    // FR-007: still on the build-list substage, with the alphabet intact.
    // Pre-fix the reset puts the walk back at identity; even reaching
    // characters again would re-run prefill, whose confirm calls
    // resetPhaseBDraft() and empties this list.
    await expect(
      page.getByLabel("Character to add"),
      "returned to a different substage — charactersSubStage was reset",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("authored-char-chip")).toHaveCount(chipCountBefore);
  });
});
