// buildKmp() in a runtime with no `Buffer` — the browser.
//
// A descriptor that selects an OSK/display font makes kmc-package read the
// font's family name through developer-utils' `getFontFamilySync`, which calls
// `Buffer.from`. Node has `Buffer`, so the rest of this suite can never see the
// browser failure ("KmpCompiler.run threw: Buffer is not defined"). This file
// removes the global before kmp.js is first loaded — vitest isolates each test
// file's module graph — and requires buildKmp to supply one itself.
//
// The "font" is not a real TTF (the repo carries no font fixture), so the
// family-name read may still fail; the assertion is only that it no longer
// fails for want of `Buffer`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import type { KmpBuildArtifacts } from "./kmp.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (...p: string[]): string => resolve(here, "__fixtures__", "bambara", ...p);
const readText = (...p: string[]): string => readFileSync(fx(...p), "utf8");

const KBD = "bambara";
const FONT_REF = "..\\..\\..\\shared\\fonts\\test\\TestFont.ttf";

/** The bambara fixture, its descriptor packaging and selecting a shared font. */
function fontSelectingVfs(): VirtualFS {
  const kps = readText("source", `${KBD}.kps`)
    .replace(
      /<\/Files>/,
      `  <File>\n      <Name>${FONT_REF}</Name>\n      <FileType>.ttf</FileType>\n    </File>\n  </Files>`,
    )
    .replace(/(<ID>bambara<\/ID>)/, `$1\n      <OSKFont>${FONT_REF}</OSKFont>`);
  if (!kps.includes("<OSKFont>") || !kps.includes(`<Name>${FONT_REF}</Name>`)) {
    throw new Error("fixture precondition failed: the font was not spliced into the descriptor");
  }
  return createVirtualFS([
    { path: `source/${KBD}.kps`, content: kps, isBinary: false },
    { path: `source/${KBD}.kmn`, content: readText("source", `${KBD}.kmn`), isBinary: false },
    { path: `source/${KBD}.kvks`, content: readText("source", `${KBD}.kvks`), isBinary: false },
    { path: `source/${KBD}.ico`, content: readFileSync(fx("source", `${KBD}.ico`)), isBinary: true },
    {
      path: `source/${KBD}.keyman-touch-layout`,
      content: readText("source", `${KBD}.keyman-touch-layout`),
      isBinary: false,
    },
    { path: "source/welcome.htm", content: readText("source", "welcome.htm"), isBinary: false },
    { path: "source/readme.htm", content: readText("source", "readme.htm"), isBinary: false },
    { path: "LICENSE.md", content: readText("LICENSE.md"), isBinary: false },
    { path: "shared/fonts/test/TestFont.ttf", content: new Uint8Array([0, 1, 0, 0, 0, 0]), isBinary: true },
  ]);
}

let artifacts: KmpBuildArtifacts;
const savedBuffer = (globalThis as { Buffer?: unknown }).Buffer;

beforeAll(async () => {
  // Compile with Node's Buffer in place; only the packaging step is under test.
  const result = await compile(fontSelectingVfs(), KBD);
  const pick = (ext: string): Uint8Array | undefined =>
    result.artifacts.find((a) => a.filename.toLowerCase().endsWith(ext))?.data;
  const kmx = pick(".kmx");
  if (kmx === undefined) throw new Error("fixture precondition failed: no .kmx from compile()");
  artifacts = {
    kmx,
    ...(pick(".kvk") !== undefined ? { kvk: pick(".kvk") as Uint8Array } : {}),
    ...(pick(".js") !== undefined ? { js: pick(".js") as Uint8Array } : {}),
  };
  expect(artifacts.kvk, "the font-name read only runs on a .kvk").toBeDefined();
  delete (globalThis as { Buffer?: unknown }).Buffer;
});

afterAll(() => {
  (globalThis as { Buffer?: unknown }).Buffer = savedBuffer;
});

describe("buildKmp() with no global Buffer (browser runtime)", () => {
  it("packages a font-selecting descriptor without failing for want of Buffer", async () => {
    expect((globalThis as { Buffer?: unknown }).Buffer).toBeUndefined();
    const { buildKmp } = await import("./kmp.js");

    const result = await buildKmp(fontSelectingVfs(), KBD, artifacts);

    const messages = result.diagnostics.map((d) => d.message);
    expect(messages.filter((m) => /Buffer is not defined/.test(m))).toEqual([]);
    expect(result.diagnostics.filter((d) => d.severity === "error" && /threw/.test(d.message))).toEqual([]);
  });
});
