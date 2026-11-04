/**
 * E2E: compile and package the LDML export (spec 108 Phase 8, Story 5).
 *
 * Runs against the PRODUCTION BUILD served by `vite preview` (playwright.trial.config.ts), like
 * the FR-070 trial: the claims concern the built chunks. `vite preview` has no keyboard picker
 * corpus, so the export files are built in Node from the corpus keyboard and handed to the page's
 * `__ksE2E__.packageLdml`, which runs the engine functions the Output page's compile panel runs
 * (`buildLdmlInBrowser`, `compareToKeymanGaps`, `buildLdmlKmp`). The `.kmp` that comes back is
 * unzipped in Node and its members and package id are inspected.
 *
 * Profile 49 is checked against the engine's profile data: the panel disables compile and package
 * for a profile the pinned schema rejects, and the source export is still produced.
 */

import { test, expect } from "playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { buildLdmlExport } from "../../engine/src/ldml-export/package.js";
import { resolveLdmlProfile } from "../../engine/src/ldml-export/profiles/resolve.js";
import { corpusExportInput } from "../../engine/src/ldml-export/__testing__/corpusExport.js";
import { loadCorpusKeyboard } from "../../engine/src/ldml-export/__testing__/corpus.js";

const HARDWARE_ONLY = "sil_yoruba8";
const WITH_TOUCH = "chechen_latin";

async function exportOf(id: string, profile: "46" | "49") {
  const kb = loadCorpusKeyboard(id);
  expect(kb, `${id} is not in the ../keyboards checkout`).toBeDefined();
  const built = corpusExportInput(kb!, profile);
  expect(built).not.toBeNull();
  const result = await buildLdmlExport(built!.input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("export refused");
  const files: Record<string, string> = {};
  for (const [path, content] of result.files) if (typeof content === "string") files[path] = content;
  return { result, files, keyboardId: built!.input.keyboardId, hasTouch: kb!.touchLayout !== undefined };
}

async function packageInPage(page: import("playwright/test").Page, e: Awaited<ReturnType<typeof exportOf>>, profile: "46" | "49") {
  return page.evaluate(
    async ([files, keyboardId, classification, profileId]) => {
      return window.__ksE2E__!.packageLdml(
        files as Record<string, string>,
        keyboardId as string,
        classification as never,
        profileId as never,
      );
    },
    [e.files, e.keyboardId, e.result.ok ? e.result.classification : null, profile] as const,
  );
}

test.describe("LDML compile and package (production build)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?e2e=1");
    await page.waitForFunction(() => window.__ksE2E__ !== undefined, undefined, { timeout: 60_000 });
  });

  test("a hardware-only profile-46 keyboard compiles with zero errors and offers an installable .kmp", async ({ page }) => {
    const e = await exportOf(HARDWARE_ONLY, "46");
    expect(e.hasTouch).toBe(false);
    const out = await packageInPage(page, e, "46");
    expect(out.ok).toBe(true);
    expect(out.expectedCodes).toEqual([]);
    expect(out.unexpectedCodes).toEqual([]);
    expect(out.compilerVersion).not.toBe("");
    expect(out.kmxPlusVersion).toBeGreaterThan(0);
    expect(out.kmpFilename).toBe(`${e.keyboardId}_ldml.kmp`);
    const members = unzipSync(Uint8Array.from(out.kmpBytes!));
    expect(Object.keys(members)).toEqual(
      expect.arrayContaining([`${e.keyboardId}_ldml.kmx`, `${e.keyboardId}_ldml.kvk`, "kmp.json", "LDML-COMPILE-REPORT.md"]),
    );
    const info = JSON.parse(strFromU8(members["kmp.json"]!)) as { keyboards: Array<{ id: string }> };
    expect(info.keyboards.map((k) => k.id)).toEqual([`${e.keyboardId}_ldml`]);
    expect(strFromU8(members["kmp.json"]!)).toMatch(/desktop only/i);
    // The source export is produced regardless and carries no compiled artifact.
    expect([...e.result.files.keys()].some((k) => k.endsWith(".kmx") || k.endsWith(".kmp"))).toBe(false);
  });

  test("a touch-bearing profile-46 keyboard compiles with its touch forms included", async ({ page }) => {
    const e = await exportOf(WITH_TOUCH, "46");
    expect(e.hasTouch).toBe(true);
    expect(e.files[`source/${e.keyboardId}_ldml.xml`]).toContain('formId="touch"');
    const out = await packageInPage(page, e, "46");
    expect(out.unexpectedCodes).toEqual([]);
    expect(out.expectedCodes).toEqual([]);
    expect(out.kmpFilename).toBe(`${e.keyboardId}_ldml.kmp`);
    const members = unzipSync(Uint8Array.from(out.kmpBytes!));
    expect(Object.keys(members)).toContain(`${e.keyboardId}_ldml.kmx`);
  });

  test("profile 49 is TR35-only: compile and package are disabled, the source export still works", async () => {
    const profile = resolveLdmlProfile("49");
    expect(profile.keymanCompilable).toBe(false);
    const e = await exportOf(HARDWARE_ONLY, "49");
    expect(e.result.zip.byteLength).toBeGreaterThan(0);
    expect(Object.keys(e.files).some((k) => k.endsWith(".xml"))).toBe(true);
  });
});
