/**
 * Full-build smoke test (spec 036 T013; SC-001, X3, X5).
 *
 * Written tests-first against the pinned interface:
 *   buildIndex(opts?: BuildOptions): FacetIndex
 *   interface BuildOptions { corpusRoot?: string; limit?: number | null; incremental?: boolean; outPath?: string }
 * `build-index.ts` does not exist yet (T018) — these tests are expected to
 * fail to resolve until it lands.
 *
 * Two corpora are exercised:
 *  1. A small, dedicated, committed fixture corpus under __fixtures__/corpus/
 *     (release/fixture/{fx_arabic,fx_latin,fx_broken}) — deterministic,
 *     independent of whether the real ../keyboards checkout is present. This
 *     is the primary coverage: it includes a keyboard whose .kmn cannot be
 *     parsed (fx_broken), proving the Edge Case that a malformed keyboard
 *     still gets a record via the fallback chain rather than being omitted.
 *  2. A `--limit`-style small slice of the real sibling corpus, guarded with
 *     `it.skipIf` (mirroring packages/engine/src/codec/roundtrip.test.ts) so
 *     it degrades gracefully in CI/environments without ../keyboards cloned.
 *
 * `outPath` is always pointed at a scratch location under os.tmpdir() so this
 * test never overwrites the real committed docs/keyboard-facet-index.json.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex } from "./build-index.js";
import type { FacetIndex, FacetTierCounts } from "./types.js";
import { DEFAULT_CORPUS_ROOT } from "./scan.js";
import { classifiedDefsDir } from "./test-support.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS_ROOT = resolve(__dir, "__fixtures__/corpus");
const DEFS = classifiedDefsDir();

/** Fresh scratch outPath per call so parallel test runs never collide. */
function scratchOutPath(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `facet-index-test-${label}-`));
  return join(dir, "index.json");
}

/** Every keyboard has a categorization for every facet the manifest declares (X3/SC-001). */
function assertFullCoverage(index: FacetIndex): void {
  for (const [id, record] of Object.entries(index.keyboards)) {
    for (const facetId of index.manifest.facetIds) {
      expect(record.facets, `keyboard '${id}' is missing a record for facet '${facetId}'`).toHaveProperty(
        facetId,
      );
    }
  }
}

/** manifest.keyboardCount agrees with the actual keyboard map, and per-facet tier counts sum to it (X5). */
function assertManifestAgreement(index: FacetIndex): void {
  expect(index.manifest.keyboardCount).toBe(Object.keys(index.keyboards).length);
  for (const [facetId, counts] of Object.entries(index.manifest.facetCoverage)) {
    const c = counts as FacetTierCounts;
    const total = c.content + c.declared + c.fallback + c.undetermined;
    expect(total, `facetCoverage['${facetId}'] tier counts do not sum to keyboardCount`).toBe(
      index.manifest.keyboardCount,
    );
  }
}

describe("buildIndex — dedicated fixture corpus (release/fixture/*)", () => {
  const index = buildIndex({
    corpusRoot: FIXTURE_CORPUS_ROOT,
    outPath: scratchOutPath("fixture"),
    facetDefsDir: DEFS,
  });

  it("produces exactly the 8 fixture keyboards", () => {
    expect(Object.keys(index.keyboards).sort()).toEqual([
      "fx_arabic",
      "fx_broken",
      "fx_dup",
      "fx_encoding_mixed",
      "fx_latin",
      "fx_mnemonic",
      "fx_reorder",
      "fx_rootlayout",
    ]);
  });

  it("every keyboard has a facets.script record (SC-001, X3)", () => {
    assertFullCoverage(index);
    for (const id of ["fx_arabic", "fx_latin", "fx_broken", "fx_rootlayout", "fx_dup"]) {
      expect(index.keyboards[id]?.facets.script, `${id} has no script record`).toBeDefined();
    }
  });

  it("manifest.keyboardCount and facetCoverage tier counts agree with the built index (X5)", () => {
    assertManifestAgreement(index);
  });

  it("fx_arabic classifies content-derived, dominant Arab", () => {
    const script = index.keyboards.fx_arabic!.facets.script!;
    expect(script.value).toBe("Arab");
    expect(script.provenanceTier).toBe("content-derived");
    expect(script.analysisOutcome).toBe("fully");
  });

  it("fx_latin classifies content-derived, dominant Latn", () => {
    const script = index.keyboards.fx_latin!.facets.script!;
    expect(script.value).toBe("Latn");
    expect(script.provenanceTier).toBe("content-derived");
    expect(script.analysisOutcome).toBe("fully");
  });

  it("fx_rootlayout (.kps at the <id> folder root, no source/ segment) is discovered, not silently dropped", () => {
    // docs/keyboard-index.md notes a few real corpus keyboards keep the .kps
    // at the folder root; KPS_SCOPE_RE_ROOT covers that layout alongside the
    // usual source/ layout so this keyboard isn't silently missing from the
    // index (X3/SC-001 — a missing record is a loud build failure, never a
    // silent gap).
    const script = index.keyboards.fx_rootlayout!.facets.script!;
    expect(script.value).toBe("Latn");
    expect(script.provenanceTier).toBe("content-derived");
    expect(script.analysisOutcome).toBe("fully");
  });

  it("fx_dup (transitional duplicate — id present under both layouts) yields exactly one record, from the source/ layout", () => {
    // fx_dup/fx_dup.kps (flat, legacy, declares en-Latn) coexists with
    // fx_dup/source/fx_dup.kps (source/, canonical, declares ar-Arab and
    // classifies content-derived Arab from its .kmn). Only one record must
    // land in the index, and it must be the source/ one, never the flat one.
    expect(Object.keys(index.keyboards).filter((id) => id === "fx_dup")).toHaveLength(1);
    const script = index.keyboards.fx_dup!.facets.script!;
    expect(script.value).toBe("Arab");
    expect(script.provenanceTier).toBe("content-derived");
  });

  // ---- spec 041 US1: nine desktop construction facets, per base ----

  it("fx_latin → casing 'cased'; fx_arabic → casing 'caseless' (script-identity driven)", () => {
    expect(index.keyboards.fx_latin!.facets.casing!.value).toBe("cased");
    expect(index.keyboards.fx_arabic!.facets.casing!.value).toBe("caseless");
  });

  it("fx_arabic (caseless/abjad) → caps-handling + normalization-posture are notApplicable, never forced", () => {
    const caps = index.keyboards.fx_arabic!.facets["caps-handling"]!;
    expect(caps.notApplicable).toBe(true);
    expect(caps.value).toBeUndefined();
    expect(caps.provenanceTier).toBe("content-derived");
    const norm = index.keyboards.fx_arabic!.facets["normalization-posture"]!;
    expect(norm.notApplicable).toBe(true);
    expect(norm.value).toBeUndefined();
  });

  it("fx_mnemonic → mnemonic-vs-positional 'mnemonic', tagged as a gate", () => {
    const mvp = index.keyboards.fx_mnemonic!.facets["mnemonic-vs-positional"]!;
    expect(mvp.value).toBe("mnemonic");
    expect(mvp.notes).toMatch(/gate/i);
    // fx_latin has no &MNEMONICLAYOUT → positional
    expect(index.keyboards.fx_latin!.facets["mnemonic-vs-positional"]!.value).toBe("positional");
  });

  it("fx_encoding_mixed → encoding records both quoted-literal and u-notation with a distribution (AS-2)", () => {
    const enc = index.keyboards.fx_encoding_mixed!.facets.encoding!;
    expect(enc.value).toEqual(expect.arrayContaining(["quoted-literal", "u-notation"]));
    expect(enc.distribution).toBeDefined();
    expect(enc.provenanceTier).toBe("content-derived");
  });

  it("fx_reorder → reordering-rules 'group-reorder-swap' from the group(reorder) convention", () => {
    expect(index.keyboards.fx_reorder!.facets["reordering-rules"]!.value).toBe("group-reorder-swap");
    // fx_latin has no reorder shape → 'none'
    expect(index.keyboards.fx_latin!.facets["reordering-rules"]!.value).toBe("none");
  });

  it("every classified construction value carries consistency or a distribution (SC-002)", () => {
    for (const facetId of ["casing", "reordering-rules", "rule-store-compaction"]) {
      const cat = index.keyboards.fx_latin!.facets[facetId]!;
      if (cat.value !== undefined && !cat.notApplicable) {
        expect(typeof cat.consistency === "number" || cat.distribution !== undefined).toBe(true);
      }
    }
  });

  it("fx_broken (unparseable .kmn) still gets a record, via the fallback chain, never omitted (Edge Case)", () => {
    const script = index.keyboards.fx_broken!.facets.script!;
    expect(script).toBeDefined();
    expect(script.analysisOutcome).toBe("fallback-only");
    // fx_broken's .kps declares en-Latn — an explicit script subtag — so this
    // must resolve at the declared-metadata tier with value "Latn", not just
    // "some non-content-derived tier" (locks against a silent tier 2 -> 3
    // degradation, P1-B).
    expect(script.provenanceTier).toBe("declared-metadata");
    expect(script.value).toBe("Latn");
    // parse() genuinely threw on fx_broken's malformed .kmn — the fallback
    // categorization must carry that diagnostic (P1-A).
    expect(script.notes).toMatch(/^parse failure: /);
  });
});

// ---------------------------------------------------------------------------
// Real-corpus slice (guarded — mirrors packages/engine/src/codec/roundtrip.test.ts)
// ---------------------------------------------------------------------------

const realCorpusAvailable = existsSync(join(DEFAULT_CORPUS_ROOT, "release"));

describe("buildIndex — real sibling corpus, --limit slice", () => {
  it.skipIf(!realCorpusAvailable)(
    "manifest/coverage invariants hold over a small real-corpus slice (X3, X5)",
    () => {
      const index = buildIndex({ limit: 5, outPath: scratchOutPath("real-slice"), facetDefsDir: DEFS });
      expect(Object.keys(index.keyboards).length).toBeGreaterThan(0);
      expect(Object.keys(index.keyboards).length).toBeLessThanOrEqual(5);
      assertFullCoverage(index);
      assertManifestAgreement(index);
    },
  );
});
