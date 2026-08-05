/**
 * Extensibility byte-diff test (spec 036 T022; SC-003; data-model "extensibility
 * invariant"). Adding a facet definition and rebuilding must (a) leave every
 * prior facet's record byte-identical, and (b) add exactly one new key under
 * each keyboard's `facets` — a pure addition, because each categorization is
 * self-contained and keys are sorted.
 *
 * The demo facet is injected here (a temp defs dir + a demo classifier composed
 * over DEFAULT_CLASSIFIERS) rather than shipped in `content/keyboard-facets/`,
 * proving the shell is facet-agnostic (T026) without touching the shipped set.
 */

import { describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex, DEFAULT_CLASSIFIERS, type ClassifierPair } from "./build-index.js";
import { stableStringify } from "./writeStable.js";
import { classifiedDefsDir } from "./test-support.js";
import type { Categorization } from "./types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS_ROOT = resolve(__dir, "__fixtures__/corpus");
const DEFS = classifiedDefsDir();

function scratchOut(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `facet-ext-${label}-`)), "index.json");
}

/** Copy the classifier-backed facet defs into a temp dir and add a demo-flag.yaml alongside. */
function defsDirWithDemo(): string {
  const dir = mkdtempSync(join(tmpdir(), "facet-defs-"));
  for (const f of readdirSync(DEFS).filter((n) => n.endsWith(".yaml"))) {
    cpSync(join(DEFS, f), join(dir, f));
  }
  writeFileSync(
    join(dir, "demo-flag.yaml"),
    [
      "id: demo-flag",
      "title: Demo flag",
      "description: A trivial demo facet proving pure-addition extensibility (test-only).",
      "valueType: enum",
      "limits:",
      '  values: ["yes", "no"]',
      "  open: false",
      "likelihoodSemantics: single value at likelihood 1",
      "derivation:",
      "  archetype: declared-metadata",
      "  classifierId: demo-flag",
      "  fallbackChain: [declared-metadata]",
      "feedsSessionFacets: []",
      "schemaVersion: 1",
      "",
    ].join("\n"),
    "utf8",
  );
  return dir;
}

const demoPair: ClassifierPair = {
  classify: (): Categorization => ({
    value: "yes",
    confidence: 1,
    confidenceClass: "confident",
    provenanceTier: "declared-metadata",
    evidenceSize: 0,
    analyzedCoverage: 1,
    analysisOutcome: "fully",
  }),
  fallback: (): Categorization => ({
    value: "no",
    confidence: 1,
    confidenceClass: "confident",
    provenanceTier: "declared-metadata",
    evidenceSize: 0,
    analyzedCoverage: 0,
    analysisOutcome: "fallback-only",
  }),
};

describe("facet-index extensibility (SC-003)", () => {
  const before = buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: scratchOut("before"), facetDefsDir: DEFS });
  const after = buildIndex({
    corpusRoot: FIXTURE_CORPUS_ROOT,
    outPath: scratchOut("after"),
    facetDefsDir: defsDirWithDemo(),
    classifiers: { ...DEFAULT_CLASSIFIERS, "demo-flag": demoPair },
  });

  // Baseline = the shipped, classifier-backed facet set. Derived from
  // DEFAULT_CLASSIFIERS rather than hardcoded so the test auto-tracks as later
  // specs register more classifiers (the commit-1169 philosophy).
  const baselineFacetIds = Object.keys(DEFAULT_CLASSIFIERS).sort();
  const withDemoFacetIds = [...baselineFacetIds, "demo-flag"].sort();

  it("adding a facet leaves every prior facet's record byte-identical", () => {
    for (const id of Object.keys(before.keyboards)) {
      for (const facetId of baselineFacetIds) {
        const priorRecord = before.keyboards[id]!.facets[facetId]!;
        const afterRecord = after.keyboards[id]!.facets[facetId]!;
        expect(stableStringify(afterRecord), `keyboard '${id}' facet '${facetId}' record changed`).toBe(
          stableStringify(priorRecord),
        );
      }
    }
  });

  it("each keyboard gains exactly one new facet key", () => {
    for (const id of Object.keys(before.keyboards)) {
      const beforeKeys = Object.keys(before.keyboards[id]!.facets).sort();
      const afterKeys = Object.keys(after.keyboards[id]!.facets).sort();
      expect(beforeKeys).toEqual(baselineFacetIds);
      expect(afterKeys).toEqual(withDemoFacetIds);
    }
  });

  it("manifest.facetIds grows by exactly the new facet", () => {
    expect(before.manifest.facetIds).toEqual(baselineFacetIds);
    expect(after.manifest.facetIds).toEqual(withDemoFacetIds);
  });

  // spec 041 T020 / Edge Case: a facet definition with no registered classifier
  // must fail the DEFAULT (non-`--classified-only`) build loud — never ship a
  // silently-partial index. `--classified-only` is the opt-in that scopes the
  // build to classifiable facets (how the shipped index is produced).
  it("a def with no classifier fails the default build loud, but --classified-only skips it", () => {
    const defsWithUnclassified = defsDirWithDemo(); // has demo-flag.yaml, but we DON'T register it
    expect(() =>
      buildIndex({
        corpusRoot: FIXTURE_CORPUS_ROOT,
        outPath: "",
        facetDefsDir: defsWithUnclassified,
        classifiers: DEFAULT_CLASSIFIERS, // no demo-flag entry
      }),
    ).toThrow(/no classifier registered for facet id "demo-flag"/);

    // With onlyClassifiedFacets, the unclassifiable def is skipped, not fatal.
    expect(() =>
      buildIndex({
        corpusRoot: FIXTURE_CORPUS_ROOT,
        outPath: "",
        facetDefsDir: defsWithUnclassified,
        classifiers: DEFAULT_CLASSIFIERS,
        onlyClassifiedFacets: true,
      }),
    ).not.toThrow();
  });
});
