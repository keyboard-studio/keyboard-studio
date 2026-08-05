/**
 * Strategy-fingerprint classifier unit tests (spec 037 US2; FR-006/FR-012/FR-013).
 *
 * Fixture IRs are built with the real codec (`parse()`), per house convention.
 * Each fixture is a minimal-but-real `.kmn`. The recognizer covers S-01 (simple
 * swap, ≤5 vkey→char rules in a non-deadkey group) and S-02 (deadkey single-tap)
 * as of classifier v1; everything else lands in `residue`.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import {
  classifyStrategyFingerprint,
  strategyFingerprintFallback,
} from "./strategy-fingerprint-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/**
 * Parse a `.kmn` and run pattern recognition, mirroring the build's central
 * pre-pass (`buildKeyboardRecord` in build-index.ts). `classifyStrategyFingerprint`
 * reads recognition state off the IR and no longer recognizes defensively, so
 * every caller — the build and these tests — must satisfy that precondition.
 */
function parseAndRecognize(kmn: string, id: string) {
  const { ir } = parse(kmn, id);
  recognizePatterns(ir);
  return ir;
}

const STRATEGY_FACET_DEF: FacetDefinition = {
  id: "strategy-fingerprint",
  title: "Input-method strategy fingerprint",
  description: "Distribution of recognized strategies over the keyboard's rules, plus residue.",
  valueType: "histogram",
  limits: {
    values: ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-12", "S-13"],
    open: false,
  },
  likelihoodSemantics: "owned-rule share per strategy; residue = 1 - recognizedRatio",
  derivation: {
    archetype: "rule-structure",
    classifierId: "strategy-fingerprint-classifier",
    fallbackChain: ["content-derived", "undetermined"],
  },
  feedsSessionFacets: ["lineage.strategy-fingerprint"],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;

/** 5 simple vkey->char swaps: recognized as S-01, no residue. */
const S01_KMN = `${HEADER}
+ [K_A] > U+0627
+ [K_S] > U+0628
+ [K_D] > U+062C
+ [K_F] > U+062F
+ [K_G] > U+0065
`;

/**
 * 6 distinct simple-swap keys in one group: the S-01 recognizer's ≤5-distinct-
 * keys guard rejects the whole group, so nothing is recognized and the rules
 * become residue — a residue-dominated fingerprint.
 */
const RESIDUE_KMN = `${HEADER}
+ [K_A] > U+0627
+ [K_S] > U+0628
+ [K_D] > U+062C
+ [K_F] > U+062F
+ [K_G] > U+0065
+ [K_H] > U+0068
`;

/**
 * 3 simple-swap rules (recognized as S-01) + 3 context-prefixed rules the
 * recognizer does not model (unrecognized). S-01 covers half the rules, so the
 * dominant recognized share (~0.5) is below the 0.80 `confident` bar while the
 * residue stays moderate -> a genuinely `mixed` fingerprint.
 */
const MIXED_KMN = `${HEADER}
+ [K_A] > U+0061
+ [K_S] > U+0062
+ [K_D] > U+0063
U+0078 + [K_E] > U+0065
U+0079 + [K_F] > U+0066
U+007A + [K_G] > U+0067
`;

/** No rules at all (header only, empty group). */
const NO_RULES_KMN = `${HEADER}`;

describe("classifyStrategyFingerprint", () => {
  it("simple-swap keyboard -> dominant S-01, low residue, confident", () => {
    const ir = parseAndRecognize(S01_KMN, "test-s01");
    const result = classifyStrategyFingerprint(ir, STRATEGY_FACET_DEF)!;

    expect(result).not.toBeNull();
    expect(result.value).toBe("S-01");
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.confidenceClass).toBe("confident");
    expect(result.residue).toBeCloseTo(0, 6);
    expect(result.distribution).toEqual({ "S-01": 1 });
    // residue is a DISTINCT field, never a distribution key (FR-012).
    expect(Object.keys(result.distribution!)).not.toContain("residue");
    // distribution + residue sums to ~1.
    const sum = Object.values(result.distribution!).reduce((a, b) => a + b, 0) + result.residue!;
    expect(sum).toBeCloseTo(1, 6);
  });

  it("unrecognized structure -> high residue, value omitted, distribution names only recognized strategies", () => {
    const ir = parseAndRecognize(RESIDUE_KMN, "test-residue");
    const result = classifyStrategyFingerprint(ir, STRATEGY_FACET_DEF)!;

    expect(result).not.toBeNull();
    expect(result.provenanceTier).toBe("content-derived");
    // Nothing recognized: residue dominates and the dominant value is omitted.
    expect(result.residue).toBeCloseTo(1, 6);
    expect(result.value).toBeUndefined();
    // Every distribution key (if any) is a real StrategyId, never "residue".
    for (const key of Object.keys(result.distribution ?? {})) {
      expect(STRATEGY_FACET_DEF.limits.values).toContain(key);
    }
    const sum = Object.values(result.distribution ?? {}).reduce((a, b) => a + b, 0) + (result.residue ?? 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("partial recognition (S-01 covers half the rules) -> mixed, value still S-01, residue distinct", () => {
    const ir = parseAndRecognize(MIXED_KMN, "test-mixed");
    const result = classifyStrategyFingerprint(ir, STRATEGY_FACET_DEF)!;

    expect(result).not.toBeNull();
    expect(result.confidenceClass).toBe("mixed");
    expect(result.residue).toBeGreaterThan(0);
    expect(result.residue).toBeLessThan(1);
    expect(result.distribution!["S-01"]).toBeGreaterThan(0);
    // Even in a mixed outcome, residue is a distinct field, never a distribution key.
    expect(Object.keys(result.distribution!)).not.toContain("residue");
    const sum = Object.values(result.distribution!).reduce((a, b) => a + b, 0) + result.residue!;
    expect(sum).toBeCloseTo(1, 6);
  });

  it("no rules -> null (fall through to the undetermined fallback)", () => {
    const ir = parseAndRecognize(NO_RULES_KMN, "test-no-rules");
    expect(classifyStrategyFingerprint(ir, STRATEGY_FACET_DEF)).toBeNull();
  });

  it("is stable under comment/whitespace-only edits (FR-013 — function of parsed structure)", () => {
    const irA = parseAndRecognize(S01_KMN, "test-stable");
    const commented = S01_KMN.replace("group(main) using keys", "c a comment\ngroup(main) using keys   ");
    const irB = parseAndRecognize(commented, "test-stable");
    const a = classifyStrategyFingerprint(irA, STRATEGY_FACET_DEF)!;
    const b = classifyStrategyFingerprint(irB, STRATEGY_FACET_DEF)!;
    expect(a.value).toBe(b.value);
    expect(a.distribution).toEqual(b.distribution);
    expect(a.residue).toBeCloseTo(b.residue!, 9);
  });
});

describe("strategyFingerprintFallback (no rule structure / parse failure)", () => {
  it("returns a fallback-only record with no fabricated distribution or residue", () => {
    const kb = { id: "broken" } as unknown as ScannedKeyboard;
    const result = strategyFingerprintFallback(kb, STRATEGY_FACET_DEF);

    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.confidenceClass).toBe("undetermined");
    expect(result.value).toBeUndefined();
    expect(result.distribution).toBeUndefined();
    expect(result.residue).toBeUndefined();
    expect(result.notes).toMatch(/undetermined/i);
  });
});
