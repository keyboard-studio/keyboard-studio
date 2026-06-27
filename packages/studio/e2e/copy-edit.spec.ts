/**
 * E2E: Track 1 (copy-edit) lane.
 *
 * BLOCKER: Playwright is not yet installed in this package.
 * All tests in this file are `.skip`-ped until Playwright is wired up.
 *
 * To unblock:
 *   1. pnpm --filter @keyboard-studio/studio add -D @playwright/test
 *   2. Create packages/studio/playwright.config.ts pointing at
 *      `baseURL: "http://localhost:5273"` (the Vite dev-server port).
 *   3. Add `"test:e2e": "playwright test"` to packages/studio/package.json scripts.
 *   4. Remove the `.skip` calls below and verify the SPA flows are live.
 *
 * Flow being tested:
 *   identity-lite step
 *     -> base-keyboard picker (Track 1, copy-edit)
 *       -> project-name step
 *         -> Track 1 survey (Phase A / B)
 *           -> emit / download
 *             -> assert .kmn + .kps + .kvks + welcome.htm present and non-empty
 *             -> assert .kmn compiles cleanly via kmcmplib WASM oracle
 *
 * refs #410 AC §3
 */

// TODO(refs #410): import { test, expect, Page } from "@playwright/test";
// TODO(refs #410): import { assertSemanticEquivalence } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Page-object helpers (stubs — implement when Playwright is wired up)
// ---------------------------------------------------------------------------

// TODO: Extract into packages/studio/e2e/page-objects/StudioPage.ts when live.
//
// async function fillIdentityLite(page: Page, opts: {
//   keyboardId: string;
//   displayName: string;
//   bcp47: string;
// }): Promise<void> {
//   await page.getByTestId("identity-keyboard-id").fill(opts.keyboardId);
//   await page.getByTestId("identity-display-name").fill(opts.displayName);
//   await page.getByTestId("identity-bcp47").fill(opts.bcp47);
//   await page.getByTestId("identity-next").click();
// }
//
// async function pickBaseKeyboard(page: Page, baseId: string): Promise<void> {
//   await page.getByTestId(`base-keyboard-option-${baseId}`).click();
//   await page.getByTestId("base-keyboard-next").click();
// }
//
// async function fillProjectName(page: Page, name: string): Promise<void> {
//   await page.getByTestId("project-name-input").fill(name);
//   await page.getByTestId("project-name-next").click();
// }
//
// async function runTrack1Survey(page: Page): Promise<void> {
//   // Walk every mandatory survey question using default answers.
//   // Adjust selectors to match actual data-testid attributes once implemented.
//   await page.getByTestId("survey-next").click();
//   await page.getByTestId("survey-finish").click();
// }
//
// async function triggerEmit(page: Page): Promise<Response> {
//   // Click the "Download .zip" button and capture the response.
//   const [download] = await Promise.all([
//     page.waitForEvent("download"),
//     page.getByTestId("emit-download").click(),
//   ]);
//   return download;
// }

// ---------------------------------------------------------------------------
// Fixture: small Latin keyboard used as the base for Track 1
// ---------------------------------------------------------------------------

// const TRACK1_FIXTURE = {
//   baseKeyboardId: "basic_kbdfr",   // see docs/keyboard-index.md
//   keyboardId: "test_copy_edit_latin",
//   displayName: "Test Copy-Edit Latin",
//   bcp47: "fr",
//   projectName: "test-copy-edit-latin",
// };

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

// Playwright is installed (global CLI v1.61.1 + playwright.config.ts).
// Lane 1 is active: identity-lite -> base picker -> Phase A/B -> emit.
// Lane 2 (import-improve.spec.ts) remains skipped pending Track 2 liveness.
describe("Track 1 (copy-edit) E2E", () => {
  // test.beforeEach(async ({ page }) => {
  //   await page.goto("/");
  // });

  it.skip("walks identity-lite -> base picker -> project-name -> Track 1 survey -> emit", async () => {
    // TODO: Implement after Playwright install.
    // const page = ... (injected by Playwright)
    // await fillIdentityLite(page, TRACK1_FIXTURE);
    // await pickBaseKeyboard(page, TRACK1_FIXTURE.baseKeyboardId);
    // await fillProjectName(page, TRACK1_FIXTURE.projectName);
    // await runTrack1Survey(page);
    // const download = await triggerEmit(page);
    // const zipPath = await download.path();
    // --- unzip and assert file existence ---
    // const entries = await listZipEntries(zipPath);  // helper TBD
    // expect(entries).toContain(`${TRACK1_FIXTURE.keyboardId}.kmn`);
    // expect(entries).toContain(`${TRACK1_FIXTURE.keyboardId}.kps`);
    // expect(entries).toContain(`${TRACK1_FIXTURE.keyboardId}.kvks`);
    // expect(entries).toContain("welcome.htm");
  });

  it.skip("emitted .kmn compiles cleanly via kmcmplib WASM oracle", async () => {
    // TODO: Implement after Playwright install.
    // Requires:
    //   - extracting the .kmn from the emitted zip (above test)
    //   - calling the kmcmplib WASM oracle
    //   - asserting zero errors
    //
    // BLOCKER: The kmcmplib WASM oracle lives in packages/engine or
    // packages/validator; confirm the import path before wiring here.
    // Candidate: @keyboard-studio/engine (ICompiler service / compileSingle).
    //
    // const kmnText = await readZipEntry(zipPath, `${TRACK1_FIXTURE.keyboardId}.kmn`);
    // const compiler = makeCompiler();  // or import from engine
    // const result = await compiler.compile(kmnText);
    // expect(result.errors).toHaveLength(0);
  });

  it.skip("emitted .kps, .kvks, and welcome.htm have non-empty bodies", async () => {
    // TODO: Implement after Playwright install.
    // for (const name of [`${TRACK1_FIXTURE.keyboardId}.kps`,
    //                     `${TRACK1_FIXTURE.keyboardId}.kvks`,
    //                     "welcome.htm"]) {
    //   const content = await readZipEntry(zipPath, name);
    //   expect(content.trim().length).toBeGreaterThan(0);
    // }
  });
});

// ---------------------------------------------------------------------------
// Placeholder so the file is never empty (vitest does not error on empty files
// but Playwright would warn on a test file with zero test blocks).
// ---------------------------------------------------------------------------

// This export keeps the module non-empty so TypeScript doesn't treat it as
// a script (no top-level imports to attach to once Playwright is wired).
export {};
