/**
 * Determinism test (spec 036 T027; FR-006, SC-004). Building twice over the same
 * corpus produces a byte-identical `keyboard-facet-index.json` — no timestamps,
 * recursively key-sorted, write-only-if-changed. Mirrors the langtags codegen
 * determinism discipline.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex } from "./build-index.js";
import { stableStringify } from "./writeStable.js";
import { classifiedDefsDir } from "./test-support.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS_ROOT = resolve(__dir, "__fixtures__/corpus");
const DEFS = classifiedDefsDir();

function scratchOut(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `facet-det-${label}-`)), "index.json");
}

describe("facet-index determinism (FR-006, SC-004)", () => {
  it("two full builds over the same corpus are byte-identical on disk", () => {
    const outA = scratchOut("a");
    const outB = scratchOut("b");
    buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: outA, facetDefsDir: DEFS });
    buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: outB, facetDefsDir: DEFS });
    expect(readFileSync(outB, "utf8")).toBe(readFileSync(outA, "utf8"));
  });

  it("the in-memory index round-trips through stableStringify unchanged", () => {
    const index = buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: "", facetDefsDir: DEFS });
    const once = stableStringify(index);
    const twice = stableStringify(JSON.parse(once));
    expect(twice).toBe(once);
  });

  it("carries no timestamp field inside the hashed payload", () => {
    const text = stableStringify(buildIndex({ corpusRoot: FIXTURE_CORPUS_ROOT, outPath: "", facetDefsDir: DEFS }));
    // Common timestamp-ish keys that would break determinism if they crept in.
    expect(text).not.toMatch(/"(builtAt|generatedAt|timestamp|date)"/);
  });
});
