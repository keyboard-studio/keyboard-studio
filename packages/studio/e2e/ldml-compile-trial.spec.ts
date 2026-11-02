/**
 * E2E: FR-070 in-browser compile trial (spec 108 Phase 7, research R31).
 *
 * Runs against the PRODUCTION BUILD served by `vite preview` (playwright.trial.config.ts), never
 * the dev server: the trial's criteria concern the built chunks. The spec fails loudly if the
 * page is the dev server.
 *
 * Flow: export a touch-bearing profile-46 corpus keyboard in Node (the same XML the CI harness
 * compiles), compile that exact string in the browser through `loadLdmlCompiler` (reached via the
 * `?e2e=1` window hook, which is live in production builds), and assert the Keyman message-code
 * set equals the H1 `keymanCompile` result for the same XML.
 *
 * The export is built in Node, not walked through the UI: `vite preview` does not run the
 * local-keyboards plugin's dev-server hooks, so the picker has no corpus, and byte-identical XML
 * on both sides is what makes the code-set comparison meaningful.
 */

import { test, expect } from "playwright/test";
import { buildLdmlExport } from "../../engine/src/ldml-export/package.js";
import { corpusExportInput } from "../../engine/src/ldml-export/__testing__/corpusExport.js";
import { loadCorpusKeyboard } from "../../engine/src/ldml-export/__testing__/corpus.js";
import { keymanCompile } from "../../engine/src/ldml-export/__testing__/keymanCompile.js";

// Touch layout with phone/tablet platforms; also in the touch corpus (touch.corpus.test.ts).
const KEYBOARD_ID = "chechen_latin";

test.describe("LDML compile trial (production build)", () => {
  test("the page is the production build, not the dev server", async ({ page, request }) => {
    const res = await request.get("/@vite/client");
    // Preview falls back to index.html for unknown paths; the dev server answers with JavaScript.
    expect(res.headers()["content-type"] ?? "").not.toContain("javascript");
    await page.goto("/");
    const scripts = await page.locator('script[type="module"][src]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("src") ?? ""),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) expect(src).toMatch(/^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.js$/);
  });

  test("kmc-ldml compiles a touch-bearing export in the browser with the CI message codes", async ({ page }) => {
    const kb = loadCorpusKeyboard(KEYBOARD_ID);
    expect(kb, `${KEYBOARD_ID} is not in the ../keyboards checkout`).toBeDefined();
    expect(kb?.touchLayout, `${KEYBOARD_ID} has no touch layout`).toBeDefined();
    const built = corpusExportInput(kb!, "46");
    expect(built).not.toBeNull();
    const result = await buildLdmlExport(built!.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.classification.touchPresent).toBe(true);
    const xml = [...result.files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string;
    expect(xml).toContain('formId="touch"');

    const baseline = await keymanCompile(xml);
    const baselineCodes = [...new Set(baseline.messages.map((m) => m.code))].sort();

    const requested: string[] = [];
    page.on("request", (r) => requested.push(new URL(r.url()).pathname));
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined, undefined, { timeout: 60_000 });
    const entryChunkRequests = requested.filter((p) => p.endsWith(".js")).length;

    // A clean export raises nothing, so also compile a broken copy: equal NON-empty code sets
    // show the browser compile genuinely ran the checks rather than returning an empty result.
    const broken = xml.replace(/<key id="[^"]*"/, '<key id="x" output="a" gap="maybe"');
    expect(broken).not.toBe(xml);
    const brokenBaseline = await keymanCompile(broken);
    const brokenCodes = [...new Set(brokenBaseline.messages.map((m) => m.code))].sort();
    expect(brokenCodes.length, "the broken copy must raise a message").toBeGreaterThan(0);

    const compileInPage = (doc: string) =>
      page.evaluate(async (d) => {
        const r = await window.__ksE2E__!.compileLdml(d);
        return { ok: r.ok, codes: [...new Set(r.messages.map((m) => m.code))].sort() };
      }, doc);
    const browser = await compileInPage(xml);
    const brokenBrowser = await compileInPage(broken);
    expect(brokenBrowser.codes).toEqual(brokenCodes);
    expect(brokenBrowser.ok).toBe(brokenBaseline.ok);

    expect(browser.ok).toBe(baseline.ok);
    expect(browser.codes).toEqual(baselineCodes);
    // The compiler chunk is fetched by the compile call, not at boot.
    expect(requested.filter((p) => p.endsWith(".js")).length).toBeGreaterThan(entryChunkRequests);
    // The kmcmplib WASM is the one the kmc-kmn chunk ships: at most one .wasm request.
    expect(new Set(requested.filter((p) => p.endsWith(".wasm"))).size).toBeLessThanOrEqual(1);
    console.info(`[INFO] ${KEYBOARD_ID}: codes=${JSON.stringify(browser.codes)} ok=${browser.ok}; broken copy codes=${JSON.stringify(brokenBrowser.codes)}`);
  });
});
