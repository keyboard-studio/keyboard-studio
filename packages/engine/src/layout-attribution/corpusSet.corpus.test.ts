// Spec 117 T002: the fixed corpus set resolves and parses.
//
// A missing corpus is a failed precondition, never a skip: every spec 117
// corpus suite iterates CORPUS_SET, and a pick that no longer parses is
// replaced in corpusSet.ts rather than skipped here.
import { describe, expect, it } from "vitest";
import { parse } from "../codec/parse.js";
import { CORPUS_SET, RELEASE_ROOT, corpusAvailable, loadCorpusKmn } from "./__fixtures__/corpusSet.js";
import type { CorpusCategory } from "./__fixtures__/corpusSet.js";

const CATEGORIES: readonly CorpusCategory[] = [
  "simple-positional",
  "deadkey-fanout",
  "deadkey-keystroke",
  "literal-context",
  "store-based",
  "conditional",
  "later-group",
  "opaque",
  "mnemonic",
  "iso",
];

describe("spec 117 corpus set", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${RELEASE_ROOT} is missing: the spec 117 corpus suites prove nothing without it`).toBe(true);
  });

  it("has at least 20 distinct keyboards covering every category", () => {
    const ids = CORPUS_SET.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    const covered = new Set(CORPUS_SET.map((e) => e.category));
    expect(CATEGORIES.filter((c) => !covered.has(c))).toEqual([]);
  });

  for (const entry of CORPUS_SET) {
    it(`${entry.id} (${entry.category}) parses`, () => {
      const kmn = loadCorpusKmn(entry.id);
      expect(kmn, `${entry.id} is not in the corpus checkout`).toBeDefined();
      const { ir } = parse(kmn!, entry.id);
      expect(ir.groups.length).toBeGreaterThan(0);
    });
  }
});
