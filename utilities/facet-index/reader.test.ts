/**
 * Reader/lookup unit tests (spec 036 T012, US1 acceptance 3).
 *
 * Written tests-first against the pinned interface:
 *   readFacet(index: FacetIndex, keyboardId: string, facetId: string): Categorization
 *   getKeyboard(index: FacetIndex, keyboardId: string): KeyboardRecord
 * `reader.ts` does not exist yet (T019) — these tests are expected to fail
 * to resolve until it lands.
 *
 * The index is a small hand-built `FacetIndex` object (not built via
 * `buildIndex` — that is T013's job) so this file is independent of the
 * scanner/UCD/build pipeline and exercises the reader surface in isolation.
 */

import { describe, it, expect } from "vitest";

import { readFacet, getKeyboard } from "./reader.js";
import type { Categorization, FacetIndex } from "./types.js";

const SCANNER_VERSION = "facet-index@1;schema@1;script@1";

function makeCategorization(overrides: Partial<Categorization> = {}): Categorization {
  return {
    value: "Arab",
    distribution: { Arab: 0.95, Latn: 0.05 },
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: 120,
    analyzedCoverage: 1,
    analysisOutcome: "fully",
    ...overrides,
  };
}

/** A minimal, well-formed two-keyboard index (data-model Entity 3 shape). */
const INDEX: FacetIndex = {
  manifest: {
    schemaVersion: 1,
    scannerVersion: SCANNER_VERSION,
    corpusCommit: "keymanapp/keyboards@deadbeef",
    corpusScope: "release/**",
    unicodeVersion: "17.0.0",
    referencePins: [],
    keyboardCount: 2,
    facetCoverage: { script: { content: 1, declared: 1, fallback: 0, undetermined: 0 } },
    facetIds: ["script"],
  },
  keyboards: {
    sil_arabic: {
      freshness: {
        sourceHashes: { "release/sil/sil_arabic/source/sil_arabic.kmn": "abc123" },
        analyzedAtScannerVersion: SCANNER_VERSION,
      },
      facets: { script: makeCategorization() },
    },
    basic_kbdus: {
      freshness: {
        sourceHashes: { "release/basic/basic_kbdus/source/basic_kbdus.kmn": "def456" },
        analyzedAtScannerVersion: SCANNER_VERSION,
      },
      facets: {
        script: makeCategorization({
          value: "Latn",
          distribution: { Latn: 1 },
          provenanceTier: "declared-metadata",
          analysisOutcome: "fallback-only",
        }),
      },
    },
  },
};

describe("readFacet", () => {
  it("returns the categorization for a known keyboard + facet (US1 acceptance 1)", () => {
    const cat = readFacet(INDEX, "sil_arabic", "script");
    expect(cat.value).toBe("Arab");
    expect(cat.provenanceTier).toBe("content-derived");
    const sum = Object.values(cat.distribution!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("distinguishes a fallback-tier record from a content-derived one (US1 acceptance 2)", () => {
    const cat = readFacet(INDEX, "basic_kbdus", "script");
    expect(cat.analysisOutcome).toBe("fallback-only");
    expect(cat.provenanceTier).not.toBe("content-derived");
  });

  it("throws an explicit 'unknown facet id' error for a facet the index does not define (US1 acceptance 3)", () => {
    expect(() => readFacet(INDEX, "sil_arabic", "not_a_real_facet")).toThrow(/unknown facet id/i);
  });

  it("throws a clear, distinct error for an unknown keyboard id", () => {
    expect(() => readFacet(INDEX, "does_not_exist", "script")).toThrow(/unknown keyboard/i);
    // Must not be conflated with the unknown-facet message.
    try {
      readFacet(INDEX, "does_not_exist", "script");
      expect.fail("expected readFacet to throw");
    } catch (err) {
      expect(String(err)).not.toMatch(/unknown facet id/i);
    }
  });
});

describe("getKeyboard", () => {
  it("returns the full record (freshness + all facets) for a known id", () => {
    const record = getKeyboard(INDEX, "sil_arabic");
    expect(record.facets.script.value).toBe("Arab");
    expect(record.freshness.analyzedAtScannerVersion).toBe(SCANNER_VERSION);
  });

  it("throws a clear 'unknown keyboard' error for an id not in the index", () => {
    expect(() => getKeyboard(INDEX, "ghost_keyboard")).toThrow(/unknown keyboard/i);
  });
});
