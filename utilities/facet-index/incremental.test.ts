/**
 * Incremental-rescan test (spec 036 T028; SC-004; US3 acceptance 1-3).
 *
 * Two layers:
 *   1. `planRescan` unit checks — a changed source hash marks only that keyboard
 *      dirty; a `scannerVersion`/`unicodeVersion` bump forces a full rescan.
 *   2. Integration — an `--incremental` rebuild over an unchanged corpus is
 *      byte-identical to the prior build (every record carries forward).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex } from "./build-index.js";
import { planRescan, scannerVersion, unicodeVersion } from "./freshness.js";
import type { FacetIndex, KeyboardRecord } from "./types.js";
import { classifiedDefsDir } from "./test-support.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS_ROOT = resolve(__dir, "__fixtures__/corpus");
const DEFS = classifiedDefsDir();

function scratchOut(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `facet-inc-${label}-`)), "index.json");
}

/** A minimal prior index whose keyboards carry the given source hashes. */
function priorIndexWith(hashes: Record<string, Record<string, string>>, over: Partial<FacetIndex["manifest"]> = {}): FacetIndex {
  const keyboards: Record<string, KeyboardRecord> = {};
  for (const [id, sourceHashes] of Object.entries(hashes)) {
    keyboards[id] = { freshness: { sourceHashes, analyzedAtScannerVersion: scannerVersion }, facets: {} };
  }
  return {
    manifest: {
      schemaVersion: 1,
      scannerVersion,
      corpusCommit: "c",
      corpusScope: "release/**",
      unicodeVersion,
      referencePins: [],
      keyboardCount: Object.keys(keyboards).length,
      facetCoverage: {},
      facetIds: ["script"],
      ...over,
    },
    keyboards,
  };
}

describe("planRescan (US3 acceptance 1-3)", () => {
  const current = { scannerVersion, unicodeVersion };

  it("marks only the keyboard whose source hash changed as dirty", () => {
    const prior = priorIndexWith({
      kb_a: { "a.kmn": "h1" },
      kb_b: { "b.kmn": "h2" },
      kb_c: { "c.kmn": "h3" },
    });
    const plan = planRescan(
      prior,
      [
        { id: "kb_a", sourceHashes: { "a.kmn": "h1" } },
        { id: "kb_b", sourceHashes: { "b.kmn": "CHANGED" } },
        { id: "kb_c", sourceHashes: { "c.kmn": "h3" } },
      ],
      current,
    );
    expect(plan.fullRescan).toBe(false);
    expect(plan.dirtyIds).toEqual(["kb_b"]);
    expect(plan.carryForwardIds.sort()).toEqual(["kb_a", "kb_c"]);
  });

  it("treats a new keyboard (not in prior) as dirty", () => {
    const prior = priorIndexWith({ kb_a: { "a.kmn": "h1" } });
    const plan = planRescan(
      prior,
      [
        { id: "kb_a", sourceHashes: { "a.kmn": "h1" } },
        { id: "kb_new", sourceHashes: { "n.kmn": "h9" } },
      ],
      current,
    );
    expect(plan.dirtyIds).toEqual(["kb_new"]);
    expect(plan.carryForwardIds).toEqual(["kb_a"]);
  });

  it("a scannerVersion bump forces a full rescan (all dirty)", () => {
    const prior = priorIndexWith({ kb_a: { "a.kmn": "h1" } }, { scannerVersion: "stale@0" });
    const plan = planRescan(prior, [{ id: "kb_a", sourceHashes: { "a.kmn": "h1" } }], current);
    expect(plan.fullRescan).toBe(true);
    expect(plan.dirtyIds).toEqual(["kb_a"]);
    expect(plan.carryForwardIds).toEqual([]);
  });

  it("a unicodeVersion bump forces a full rescan", () => {
    const prior = priorIndexWith({ kb_a: { "a.kmn": "h1" } }, { unicodeVersion: "1.0.0" });
    const plan = planRescan(prior, [{ id: "kb_a", sourceHashes: { "a.kmn": "h1" } }], current);
    expect(plan.fullRescan).toBe(true);
  });

  it("no prior index forces a full rescan", () => {
    const plan = planRescan(null, [{ id: "kb_a", sourceHashes: { "a.kmn": "h1" } }], current);
    expect(plan.fullRescan).toBe(true);
    expect(plan.dirtyIds).toEqual(["kb_a"]);
  });
});

describe("buildIndex --incremental integration", () => {
  it("an unchanged-corpus incremental rebuild is byte-identical to the prior build", () => {
    const out = scratchOut("carry");
    buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: out, facetDefsDir: DEFS }); // build 1 (full)
    const build1 = readFileSync(out, "utf8");
    buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: out, incremental: true, facetDefsDir: DEFS }); // build 2 (incremental)
    expect(readFileSync(out, "utf8")).toBe(build1);
  });
});
