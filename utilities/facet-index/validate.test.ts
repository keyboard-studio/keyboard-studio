/**
 * Build-time schema-violation tests (spec 036 T023; FR-008; US2 acceptance 2/3;
 * contract X1/X2/X4 + C3).
 *
 * Two layers:
 *   1. `validateCategorization` unit checks — X1 (out-of-limits value/distribution
 *      key), X2 (distribution/residue sum), X4 (outcome↔tier).
 *   2. Integration — a mis-implemented classifier emitting an out-of-limits value
 *      makes `buildIndex` throw (exit non-zero, record nothing); a bad facet
 *      definition makes the loader throw (C3).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCategorization } from "./validate.js";
import { loadFacetDefs } from "./load-defs.js";
import { buildIndex, DEFAULT_CLASSIFIERS, type ClassifierPair } from "./build-index.js";
import type { Categorization, FacetDefinition } from "./types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, "..", "..");
const REAL_CONTENT_DIR = resolve(REPO_ROOT, "content", "keyboard-facets");
const FIXTURE_CORPUS_ROOT = resolve(__dir, "__fixtures__/corpus");

const CLOSED_HISTOGRAM: FacetDefinition = {
  id: "demo",
  title: "Demo",
  description: "closed histogram for validation unit tests",
  valueType: "histogram",
  limits: { values: ["Arab", "Latn"], open: false },
  likelihoodSemantics: "share",
  derivation: { archetype: "character-content", classifierId: "x", fallbackChain: ["content-derived"] },
  feedsSessionFacets: [],
  schemaVersion: 1,
};

function goodCat(over: Partial<Categorization> = {}): Categorization {
  return {
    value: "Arab",
    distribution: { Arab: 1 },
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: 3,
    analyzedCoverage: 1,
    analysisOutcome: "fully",
    ...over,
  };
}

describe("validateCategorization (X1/X2/X4)", () => {
  it("accepts a well-formed record", () => {
    expect(validateCategorization("kb", CLOSED_HISTOGRAM, goodCat())).toEqual([]);
  });

  it("X1: value outside limits.values is a problem", () => {
    const problems = validateCategorization("kb", CLOSED_HISTOGRAM, goodCat({ value: "Cyrl", distribution: { Cyrl: 1 } }));
    expect(problems.some((p) => p.startsWith("X1:"))).toBe(true);
  });

  it("X1: distribution key outside limits.values is a problem", () => {
    const problems = validateCategorization("kb", CLOSED_HISTOGRAM, goodCat({ distribution: { Arab: 0.5, Deva: 0.5 } }));
    expect(problems.some((p) => p.startsWith("X1:") && p.includes("Deva"))).toBe(true);
  });

  it("X1: an open-set facet skips the membership check", () => {
    const openDef: FacetDefinition = { ...CLOSED_HISTOGRAM, limits: { values: ["Arab"], open: true } };
    expect(validateCategorization("kb", openDef, goodCat({ value: "Cyrl", distribution: { Cyrl: 1 } }))).toEqual([]);
  });

  it("X2: a distribution not summing to ~1 is a problem", () => {
    const problems = validateCategorization("kb", CLOSED_HISTOGRAM, goodCat({ distribution: { Arab: 0.5, Latn: 0.2 } }));
    expect(problems.some((p) => p.startsWith("X2:"))).toBe(true);
  });

  it("X2: distribution + residue summing to ~1 is accepted", () => {
    const problems = validateCategorization("kb", CLOSED_HISTOGRAM, goodCat({ distribution: { Arab: 0.7 }, residue: 0.3 }));
    expect(problems.filter((p) => p.startsWith("X2:"))).toEqual([]);
  });

  it("X4: fallback-only + content-derived is inconsistent", () => {
    const problems = validateCategorization(
      "kb",
      CLOSED_HISTOGRAM,
      goodCat({ analysisOutcome: "fallback-only", provenanceTier: "content-derived" }),
    );
    expect(problems.some((p) => p.startsWith("X4:"))).toBe(true);
  });
});

describe("build-time enforcement (US2 acceptance 2)", () => {
  function defsDirWith(yaml: string, name: string): string {
    const dir = mkdtempSync(join(tmpdir(), "facet-defs-bad-"));
    writeFileSync(join(dir, `${name}.yaml`), yaml, "utf8");
    return dir;
  }

  it("a classifier emitting an out-of-limits value fails the build (X1)", () => {
    const dir = defsDirWith(
      [
        "id: bad",
        "title: Bad",
        "description: emits an out-of-limits value",
        "valueType: enum",
        'limits: { values: ["yes", "no"], open: false }',
        "likelihoodSemantics: single value",
        "derivation: { archetype: declared-metadata, classifierId: bad, fallbackChain: [declared-metadata] }",
        "feedsSessionFacets: []",
        "schemaVersion: 1",
        "",
      ].join("\n"),
      "bad",
    );
    const badPair: ClassifierPair = {
      classify: (): Categorization => ({
        value: "MAYBE", // outside ["yes","no"] → X1
        confidence: 1,
        confidenceClass: "confident",
        provenanceTier: "declared-metadata",
        evidenceSize: 0,
        analyzedCoverage: 1,
        analysisOutcome: "fully",
      }),
      fallback: (): Categorization => ({
        value: "MAYBE",
        confidence: 1,
        confidenceClass: "confident",
        provenanceTier: "declared-metadata",
        evidenceSize: 0,
        analyzedCoverage: 0,
        analysisOutcome: "fallback-only",
      }),
    };
    expect(() =>
      buildIndex({
        corpusRoot: FIXTURE_CORPUS_ROOT,
        outPath: "",
        facetDefsDir: dir,
        classifiers: { ...DEFAULT_CLASSIFIERS, bad: badPair },
      }),
    ).toThrow(/X1/);
  });

  it("a malformed facet definition fails the loader (C3)", () => {
    // histogram valueType but no limits.values → C3 violation.
    const dir = defsDirWith(
      [
        "id: nolimits",
        "title: No limits",
        "description: histogram without limits.values",
        "valueType: histogram",
        "limits: {}",
        "likelihoodSemantics: share",
        "derivation: { archetype: character-content, classifierId: x, fallbackChain: [content-derived] }",
        "feedsSessionFacets: []",
        "schemaVersion: 1",
        "",
      ].join("\n"),
      "nolimits",
    );
    expect(() => loadFacetDefs(dir)).toThrow(/C3/);
  });

  it("the shipped content/keyboard-facets defs all load clean", () => {
    expect(() => loadFacetDefs(REAL_CONTENT_DIR)).not.toThrow();
  });
});
