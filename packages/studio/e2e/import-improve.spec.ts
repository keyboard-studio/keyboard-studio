/**
 * E2E: Track 2 (import-improve) lane.
 *
 * (STALE, resolved) Former BLOCKER: "Playwright is not yet installed."
 * Playwright is now wired up in this package — the four sibling walk specs
 * (carve, copy-edit, touch-derivation-us1/us2) run live/passing against the
 * global Playwright CLI. This is no longer a blocker.
 *
 * REMAINING BLOCKER (as of 2026-07-20): the arbitrary-`.kmn` file-import /
 * source-picker UX that this spec's flow is written against does not exist yet.
 * Track 2's `instantiateFromExisting` ("Adapt") workflow IS live and E2E-tested
 * via the gallery-based Adapt card (see touch-derivation-us1/us2.spec.ts), but
 * that path adapts a base chosen from the gallery — NOT a file uploaded through
 * a file-picker. The file-picker entry point is still an explicit TODO:
 * see packages/studio/src/stores/workingCopyStore.ts (TODO(track2-ui)).
 * There is no `track2-import-button` / filechooser / source-picker testid in
 * packages/studio/src today. Confirm with km-frontend before un-skipping.
 *
 * To unblock (in order):
 *   1. Land the arbitrary-`.kmn` import / source-picker UX (TODO(track2-ui)
 *      in workingCopyStore.ts), OR rewrite this spec to exercise Track 2 adapt
 *      via the gallery path as the touch-derivation specs already do.
 *   2. Confirm the re-import path (emitted .kmn -> KeyboardIR) is live in
 *      the engine (codec round-trip).
 *   3. Remove `.skip` calls.
 *
 * Flow being tested:
 *   launch SPA
 *     -> load fixture .kmn (basic_kbdfr from keymanapp/keyboards)
 *       -> import via Track 2 (KeyboardIR parse)
 *         -> apply one mutation (e.g. change displayName)
 *           -> emit output
 *             -> re-import emitted .kmn to KeyboardIR
 *               -> assertSemanticEquivalence: everything preserved except the
 *                  intentional mutation
 *
 * refs #410 AC §3
 */

// TODO(refs #410): import { test, expect, Page } from "@playwright/test";
// TODO(refs #410): import { assertSemanticEquivalence } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture: small keyboard used as the import source
// ---------------------------------------------------------------------------
//
// basic_kbdfr is the French AZERTY keyboard — small, well-formed, registered
// in docs/keyboard-index.md, and exercises basic vkey+modifier rules.
//
// const FIXTURE_KMN_PATH =
//   "../../../keyboards/release/b/basic_kbdfr/source/basic_kbdfr.kmn";
//
// const MUTATION = {
//   field: "displayName",
//   before: "French (AZERTY)",
//   after: "French (AZERTY) — Round-Trip Test",
// };

// ---------------------------------------------------------------------------
// Page-object stubs
// ---------------------------------------------------------------------------

// TODO: Extract into packages/studio/e2e/page-objects/StudioPage.ts when live.
//
// async function importKmnViaTrack2(page: Page, kmnPath: string): Promise<void> {
//   // The Track 2 entry point should be a file-import button or drag-target.
//   // Adjust the data-testid when the UI is confirmed.
//   const [fileChooser] = await Promise.all([
//     page.waitForEvent("filechooser"),
//     page.getByTestId("track2-import-button").click(),
//   ]);
//   await fileChooser.setFiles(kmnPath);
//   await page.getByTestId("track2-import-confirm").click();
// }
//
// async function applyMutation(page: Page, mutation: typeof MUTATION): Promise<void> {
//   // Navigate to the relevant survey question and change the value.
//   // Exact selector depends on survey question module for displayName.
//   await page.getByTestId("survey-display-name-input").fill(mutation.after);
//   await page.getByTestId("survey-next").click();
// }
//
// async function triggerEmitAndCapture(page: Page): Promise<string> {
//   // Returns path to the downloaded zip.
//   const [download] = await Promise.all([
//     page.waitForEvent("download"),
//     page.getByTestId("emit-download").click(),
//   ]);
//   return download.path() as Promise<string>;
// }

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

// TODO(refs #410): Replace `describe.skip` with `test.describe` once the
// remaining blocker above (Track 2 file-import UX) is resolved.
describe.skip("Track 2 (import-improve) E2E", () => {
  // test.beforeEach(async ({ page }) => {
  //   await page.goto("/");
  // });

  it.skip("imports a fixture .kmn via Track 2 without import errors", async () => {
    // TODO: Implement after Playwright install + Track 2 UI is live.
    //
    // await importKmnViaTrack2(page, FIXTURE_KMN_PATH);
    // // The import status badge should be "clean" or "clean-with-opaque"
    // await expect(page.getByTestId("import-status-badge")).not.toHaveText("parse-failure");
    // await expect(page.getByTestId("import-status-badge")).not.toHaveText("round-trip-divergence");
  });

  it.skip("applies one mutation and emits without compile errors", async () => {
    // TODO: Implement after Playwright install + Track 2 UI is live.
    //
    // await importKmnViaTrack2(page, FIXTURE_KMN_PATH);
    // await applyMutation(page, MUTATION);
    // const zipPath = await triggerEmitAndCapture(page);
    // const kmnText = await readZipEntry(zipPath, "basic_kbdfr.kmn");  // helper TBD
    // const compiler = makeCompiler();
    // const result = await compiler.compile(kmnText);
    // expect(result.errors).toHaveLength(0);
  });

  it.skip("round-trip via assertSemanticEquivalence preserves everything except the mutation", async () => {
    // TODO: Implement after Playwright install + Track 2 UI + codec round-trip live.
    //
    // BLOCKER: re-importing the emitted .kmn back to KeyboardIR requires the
    // codec (packages/engine or packages/compiler) to be callable from the test.
    // Confirm the import: path before wiring.
    //
    // --- Step 1: parse the original fixture .kmn to IRa ---
    // const originalKmn = fs.readFileSync(FIXTURE_KMN_PATH, "utf8");
    // const { ir: irOriginal } = await parseKmn(originalKmn);  // codec, TBD
    //
    // --- Step 2: import via SPA, mutate, emit ---
    // await importKmnViaTrack2(page, FIXTURE_KMN_PATH);
    // await applyMutation(page, MUTATION);
    // const zipPath = await triggerEmitAndCapture(page);
    // const emittedKmn = await readZipEntry(zipPath, "basic_kbdfr.kmn");
    //
    // --- Step 3: re-parse the emitted .kmn to IRb ---
    // const { ir: irEmitted } = await parseKmn(emittedKmn);
    //
    // --- Step 4: assert semantic equivalence, ignoring the one mutated field ---
    // const { equivalent, differences } = assertSemanticEquivalence(irOriginal, irEmitted);
    //
    // // The only difference should be the display name mutation.
    // const unexpectedDiffs = differences.filter(
    //   (d) => d.path !== "header.name"
    // );
    // expect(unexpectedDiffs).toHaveLength(0);
    //
    // // The mutation itself should be present.
    // const nameDiff = differences.find((d) => d.path === "header.name");
    // expect(nameDiff?.a).toBe(MUTATION.before);
    // expect(nameDiff?.b).toBe(MUTATION.after);
  });
});

// This export keeps the module non-empty so TypeScript doesn't treat it as a
// script (no top-level imports once Playwright is wired).
export {};
