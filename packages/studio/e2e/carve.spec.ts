// E2E: Rule Carver deletion round-trip (spec §11 carve gallery; engine
// pattern-apply/carveFilterIr.ts).
//
// Proves the full AC2 chain for the carve feature: importing a keyboard with
// recognized patterns AND at least one opaque (raw) rule, carving that one
// opaque rule out via the Inspector's two-step confirm, confirming the live
// working-copy IR reflects the deletion via the window.__ksE2E__ hook, then
// confirming the emitted .kmn genuinely omits the deleted rule's distinguishing
// output token.
//
// Fixture: bj_cree_woods (Western Cree, TH-Woods variant — see
// docs/keyboard-index.md). Chosen because its source .kmn contains a raw
// (opaque) fragment at nodeId "rule#93":
//
//   if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)
//
// rule#93 is the ONLY rule in the keyboard that references the C_efc store,
// so its distinguishing token in the emitted .kmn is "index(C_efc,3)" —
// present when the rule is kept, absent once it is carved out.
//
// Run (Playwright is the global CLI only — see playwright.config.ts header):
//   cd packages/studio && npx playwright test carve.spec.ts
//
// Requires `pnpm install` to have linked the `fflate` devDependency added to
// packages/studio/package.json alongside this spec (see report — reused at
// the same pinned version already vetted for @keyboard-studio/engine's own
// zip writer, not a new library introduction).

import { test, expect } from "playwright/test";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  driveIdentityLite,
  pickBaseKeyboard,
  chooseAdaptTrack,
  confirmPrefill,
  buildOneCharacterList,
  confirmMechanismsEmpty,
  driveTouchGallery,
  driveHelpPhase,
  seedReturningVisitor,
} from "./helpers/surveyFlow";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const BASE_KEYBOARD_ID = "bj_cree_woods";
const TARGET_NODE_ID = "rule#93";
// Present in the emitted .kmn iff rule#93 (the sole index(C_efc,...) user) survives.
const KEPT_ONLY_TOKEN = "index(C_efc,3)";
const KMN_ZIP_PATH = `source/${BASE_KEYBOARD_ID}.kmn`;

/**
 * Pre-existing 1.4.3 (Contrast Minimum) offenders on the carve gallery,
 * excluded by selector with the criterion and reason named inline — the same
 * idiom e2e/tab-roundtrip.spec.ts and e2e/decision-deeplink.spec.ts use
 * (KNOWN_CONTRAST_DEBT). This is spec 056's open tracker debt
 * (specs/056-ada-accessibility/wcag-2.2-aa-tracker.md, 1.4.3 is an open
 * `unknown` row), not anything introduced or touched by spec 057 — the
 * components (CarveGallery.tsx, RemovalBanner.tsx) are byte-identical to
 * `main` (see specs/057-bulletproof-navigation/evidence/gating-red.md
 * §"Two corrections made to reach a *valid* red").
 */
const KNOWN_CONTRAST_DEBT: readonly string[] = [
  // 1.4.3 — CarveGallery's info-panel toggle button.
  'button[aria-label="Hide info panel"]',
  // 1.4.3 — CarveGallery's footer "Continue" button.
  'button[data-testid="carve-continue"]',
  // 1.4.3 — RemovalBanner's dismiss control (assignLoop/parts/RemovalBanner.tsx).
  'button[aria-label="Dismiss removal recommendation"]',
  // 1.4.3 — RemovalBanner's own region (its collapsed-strip text sits on the
  // green-tinted background at a ratio axe flags). Excluded by the banner's
  // stable aria-label rather than the anonymous div chain axe reports (the
  // chain has no data-testid/aria hook of its own to key on).
  'div[aria-label="Removal recommendation"]',
  // 1.4.3 — Rail's per-node carve-card buttons: the "kept/total" and
  // per-modifier breakdown spans inside them (Rail.tsx) fall short.
  // Excluded by the testid PREFIX (carve-card-<nodeId> varies per fixture,
  // e.g. "carve-card-group#0") rather than the brittle nth-child span chain
  // axe reports for the same reason.
  'button[data-testid^="carve-card-"]',
  // 1.4.3 — GlyphCell's cross-reference tag chips (assignLoop/parts/
  // GlyphCell.tsx): "<kind> — go to" / "<kind> — N places". Keyed on the
  // aria-label SUFFIX because the kind prefix varies ("store", "group", ...)
  // and the chips carry no testid.
  'button[aria-label$="go to"]',
  'button[aria-label$="places"]',
  // 1.4.3 — Rail's sticky SectionHeader (assignLoop/parts/Rail.tsx): the
  // tone-colored uppercase section label. The header is an anonymous div
  // with no testid/aria hook, so it is keyed on its one distinguishing
  // attribute — the inline-style signature only this header uses. Adding a
  // programmatic landmark to Rail is 056's call, not this spec's.
  'div[style*="letter-spacing: 0.13em"]',
];

/**
 * Pre-existing 1.4.3 offenders on the OUTPUT screen (same rules and evidence
 * trail as KNOWN_CONTRAST_DEBT above — spec 056's open tracker debt; both
 * components predate and are untouched by spec 057). Kept as a separate list
 * because the two screens share no offending component.
 */
const KNOWN_CONTRAST_DEBT_OUTPUT: readonly string[] = [
  // 1.4.3 — OskModeToggle's inactive mode button (components/OskModeToggle.tsx):
  // the unselected toggle half's text on the group background falls short.
  'div[role="group"] > button',
  // 1.4.3 — SignUpPanel's GitHub button; the same exclusion
  // decision-deeplink.spec.ts already carries for shared chrome.
  'button[aria-label="Sign up with GitHub"]',
];

// ---------------------------------------------------------------------------
// window.__ksE2E__ typing — mirrors packages/studio/src/lib/e2eHook.ts.
// Declared locally (not imported) so this spec has no compile-time coupling
// to studio's src/ internals beyond the documented window contract.
// ---------------------------------------------------------------------------

interface KsE2EHook {
  getWorkingIr(): KeyboardIR | null;
  getDeletedNodeIds(): string[];
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

// ---------------------------------------------------------------------------
// Page-object-lite helpers (carve-specific)
// ---------------------------------------------------------------------------
//
// The shared survey prelude (identity-lite, base picker, track choice,
// prefill, character list, mechanism/touch galleries, help phase) now lives
// in ./helpers/surveyFlow and is imported above. There is no carve-local
// driver left: the standalone Sequence Gallery step (formerly inserted
// between mechanisms and the touch fork) has been retired — S-03 sequences
// now build inline inside the Mechanism Gallery's method chooser (selecting
// the "sequence" method swaps the right/preview pane for SequenceBuilderPanel;
// see MechanismGallery.tsx). This fixture's mechanism step never flags a
// character for anything (confirmMechanismsEmpty's "No new characters to
// add." empty-diff path), so there is no per-character loop here to drive the
// sequence builder through — nothing to replace the old pass-through driver
// with for THIS walk.

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe("Rule Carver — carve one opaque rule, verify IR + emitted .kmn", () => {
  test("deleting rule#93 in the carve gallery removes it from the deleted-node IR state and from the emitted .kmn", async ({ page }) => {
    // ?e2e=1 is the runtime override for installE2eHook() (src/lib/e2eHook.ts)
    // — no VITE_E2E build flag needed. Seed the returning-visitor flag first
    // so the fresh browser context skips WelcomeScreen (see seedReturningVisitor).
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Nehiyawewin",
      script: "other",
    });
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    // Manifest spine order (StudioShell.tsx) is characters -> marks -> carve ->
    // mechanisms -> touch -> help (no separate sequences step — S-03 builds
    // inline in the Mechanism Gallery, see the note above); the marks-free
    // alphabet ("᙮") auto-skips the marks step, so carve renders right after
    // Phase B.

    // ---------------------------------------------------------------------
    // Carve gallery
    // ---------------------------------------------------------------------
    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    const targetCard = page.getByTestId(`carve-card-${TARGET_NODE_ID}`);
    await expect(targetCard).toBeVisible();
    await expect(targetCard).toHaveAttribute("data-kind", "raw");

    // Accessibility gate (spec 056 FR-003): scan the carve gallery screen.
    await expectNoSeriousAxeViolations(page, "carve gallery (bj_cree_woods)", {
      exclude: KNOWN_CONTRAST_DEBT,
    });

    await targetCard.click();

    await page.getByTestId("raw-remove-anyway").click();
    await page.getByTestId("raw-confirm-remove").click();

    // ---------------------------------------------------------------------
    // AC2 checkpoint 1: the IR reflects the deletion.
    //
    // getWorkingIr().raw still LISTS rule#93 — the raw array is filtered at
    // emit time by carveFilterIr, not mutated in place. The deletion is
    // recorded in the deletedNodeIds overlay, which is what this asserts.
    // ---------------------------------------------------------------------
    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedNodeIds() ?? []),
        { timeout: 5_000 },
      )
      .toContain(TARGET_NODE_ID);

    const workingIr = await page.evaluate(() => window.__ksE2E__?.getWorkingIr() ?? null);
    expect(workingIr).not.toBeNull();
    expect(workingIr?.raw.some((frag) => frag.nodeId === TARGET_NODE_ID)).toBe(true);

    await page.getByTestId("carve-continue").click();

    // ---------------------------------------------------------------------
    // Remaining spine steps: mechanisms, touch, help. (No separate sequences
    // step — see the note above the describe block.)
    // ---------------------------------------------------------------------
    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    // handlePhaseFComplete navigates to #output.
    await page.waitForURL(/#output$/);

    // Accessibility gate (spec 056 FR-003): scan the output screen.
    await expectNoSeriousAxeViolations(page, "output screen (carve walk)", {
      exclude: KNOWN_CONTRAST_DEBT_OUTPUT,
    });

    // ---------------------------------------------------------------------
    // AC2 checkpoint 2: the emitted .kmn omits the deleted rule.
    // ---------------------------------------------------------------------
    const downloadButton = page.getByTestId("emit-download");
    await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();

    const zipBytes = await readFile(zipPath as string);
    const entries = unzipSync(new Uint8Array(zipBytes));

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).not.toContain(KEPT_ONLY_TOKEN);
  });

  // Positive control — same walk, but the opaque rule is left in place, so
  // the emitted .kmn MUST contain the token. This is the guard that proves
  // the primary test's negative assertion is actually exercising the carve
  // path rather than passing because the token was never emitted at all
  // (e.g. a scaffold/base-resolution regression that silently drops raw
  // fragments before the carve step even runs).
  test("control: keeping rule#93 leaves its distinguishing token in the emitted .kmn", async ({ page }) => {
    await seedReturningVisitor(page);
    await page.goto("/?e2e=1");

    await driveIdentityLite(page, {
      english: "Test",
      autonym: "Nehiyawewin",
      script: "other",
    });
    await pickBaseKeyboard(page, BASE_KEYBOARD_ID);
    await chooseAdaptTrack(page);
    await confirmPrefill(page);
    await buildOneCharacterList(page, "᙮");

    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    // Select the card to confirm it is present and raw-kind, but do NOT
    // remove it — this is the "nothing carved" control path.
    const targetCard = page.getByTestId(`carve-card-${TARGET_NODE_ID}`);
    await expect(targetCard).toBeVisible();
    await expect(targetCard).toHaveAttribute("data-kind", "raw");

    await expect
      .poll(
        () => page.evaluate(() => window.__ksE2E__?.getDeletedNodeIds() ?? []),
        { timeout: 5_000 },
      )
      .not.toContain(TARGET_NODE_ID);

    await page.getByTestId("carve-continue").click();

    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    await page.waitForURL(/#output$/);

    const downloadButton = page.getByTestId("emit-download");
    await expect(downloadButton).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();

    const zipBytes = await readFile(zipPath as string);
    const entries = unzipSync(new Uint8Array(zipBytes));

    const kmnBytes = entries[KMN_ZIP_PATH];
    expect(kmnBytes, `expected ${KMN_ZIP_PATH} in the emitted zip`).toBeDefined();
    const kmnText = strFromU8(kmnBytes as Uint8Array);

    expect(kmnText).toContain(KEPT_ONLY_TOKEN);
  });
});
