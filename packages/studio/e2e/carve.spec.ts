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

import { test, expect, type Page } from "playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  surveyAdvance,
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

    // Manifest spine order (StudioShell.tsx) is characters -> carve ->
    // mechanisms -> touch -> help; carve comes immediately after Phase B,
    // BEFORE mechanisms/touch.

    // ---------------------------------------------------------------------
    // Carve gallery
    // ---------------------------------------------------------------------
    const carveGallery = page.getByTestId("carve-gallery");
    await expect(carveGallery).toBeVisible({ timeout: 30_000 });

    const targetCard = page.getByTestId(`carve-card-${TARGET_NODE_ID}`);
    await expect(targetCard).toBeVisible();
    await expect(targetCard).toHaveAttribute("data-kind", "raw");
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
    // Remaining spine steps: mechanisms, touch, help.
    // ---------------------------------------------------------------------
    await confirmMechanismsEmpty(page);
    await driveTouchGallery(page);
    await driveHelpPhase(page);

    // handlePhaseFComplete navigates to #output.
    await page.waitForURL(/#output$/);

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
