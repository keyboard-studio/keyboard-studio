/**
 * Font-dependency classifier unit tests (spec 043 US1; FR-013; AS #4).
 *
 * `system-font-reliant` iff the `.kps` bundles a `.ttf`/`.otf` AND the font is
 * wired into rendering (a `.kps` <OSKFont>/<DisplayFont> or a `.kmn`
 * visual-keyboard store); `self-contained` otherwise. Exercised through the
 * fallback path with synthetic `.kps` XML + optional `.kmn` text.
 */

import { describe, it, expect } from "vitest";

import { classifyFontDependency, fontDependencyFallback } from "./font-dependency-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "font-dependency",
  title: "Font dependency",
  description: "Whether the base depends on a bundled font to render.",
  valueType: "enum",
  limits: { values: ["self-contained", "system-font-reliant"], open: false },
  likelihoodSemantics: "bundled-font + font-wiring determination",
  derivation: { archetype: "declared-metadata", classifierId: "font-dependency-classifier", fallbackChain: ["declared-metadata", "default-fallback"] },
  feedsSessionFacets: ["source.font-dependency"],
  schemaVersion: 1,
};

const KPS_PATH = "release/t/test/source/test.kps";

function makeKb(opts: { kps?: string | null; kmn?: string | null }): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (opts.kps != null) sources.push({ path: KPS_PATH, bytes: Buffer.from(opts.kps, "utf8") });
  return { id: "test", kpsPath: KPS_PATH, kmnPath: opts.kmn != null ? "release/t/test/source/test.kmn" : null, kmnText: opts.kmn ?? null, sources };
}

const FONT_FILE = `<File><Name>fonts\\MyFont.ttf</Name><FileType>.ttf</FileType></File>`;

describe("classifyFontDependency", () => {
  it("has no content tier — always returns null", () => {
    expect(classifyFontDependency({} as never, DEF)).toBeNull();
  });
});

describe("fontDependencyFallback", () => {
  it("bundles a .ttf AND declares an <OSKFont> -> system-font-reliant", () => {
    const kps = `<?xml version="1.0"?><Package><Files>${FONT_FILE}</Files><Keyboards><Keyboard><OSKFont>MyFont.ttf</OSKFont></Keyboard></Keyboards></Package>`;
    const result = fontDependencyFallback(makeKb({ kps }), DEF);
    expect(result.value).toBe("system-font-reliant");
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("bundles a .ttf AND the .kmn wires a visual keyboard -> system-font-reliant", () => {
    const kps = `<?xml version="1.0"?><Package><Files>${FONT_FILE}</Files></Package>`;
    const kmn = "store(&VISUALKEYBOARD) 'test.kvks'\nbegin Unicode > use(main)\n";
    const result = fontDependencyFallback(makeKb({ kps, kmn }), DEF);
    expect(result.value).toBe("system-font-reliant");
  });

  it("bundles a font but does not wire it -> self-contained", () => {
    const kps = `<?xml version="1.0"?><Package><Files>${FONT_FILE}</Files></Package>`;
    const result = fontDependencyFallback(makeKb({ kps }), DEF);
    expect(result.value).toBe("self-contained");
    expect(result.notes).toMatch(/does not wire/i);
  });

  it("no bundled font -> self-contained, declared-metadata", () => {
    const kps = `<?xml version="1.0"?><Package><Files><File><Name>..\\build\\test.kmx</Name><FileType>.kmx</FileType></File></Files></Package>`;
    const result = fontDependencyFallback(makeKb({ kps }), DEF);
    expect(result.value).toBe("self-contained");
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("no readable .kps -> self-contained, default-fallback", () => {
    const result = fontDependencyFallback(makeKb({ kps: null }), DEF);
    expect(result.value).toBe("self-contained");
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
