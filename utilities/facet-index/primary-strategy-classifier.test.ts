/**
 * Primary-strategy classifier unit tests (spec 043 US1; FR-010; AS #1).
 *
 * The arg-max / tie logic is exercised with hand-built `recognizedPatterns`
 * arrays (deterministic, decoupled from the recognizer's evolving coverage), and
 * the end-to-end path is covered with one real `parse()` + `recognizePatterns`
 * fixture so the classifier's read of the shared IR state is validated too.
 */

import { describe, it, expect } from "vitest";

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { parse } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import { classifyPrimaryStrategy, primaryStrategyFallback } from "./primary-strategy-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "primary-strategy",
  title: "Primary strategy",
  description: "The base's own dominant spec-§7 strategy.",
  valueType: "enum",
  limits: {
    values: ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-12", "S-13", "mixed"],
    open: false,
  },
  likelihoodSemantics: "mode of the per-keyboard owned-rule strategy tally",
  derivation: { archetype: "rule-structure", classifierId: "primary-strategy-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: ["lineage.primary-strategy"],
  schemaVersion: 1,
};

/** A minimal IR carrying only what the classifier reads (recognizedPatterns, raw, groups, stores). */
function fakeIr(patterns: Array<{ strategyId?: string; ruleCount: number }>): KeyboardIR {
  return {
    recognizedPatterns: patterns.map((p) => ({
      strategyId: p.strategyId,
      ownedNodes: Array.from({ length: p.ruleCount }, () => ({ kind: "rule" })),
    })),
    raw: [],
    groups: [],
    stores: [],
  } as unknown as KeyboardIR;
}

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("classifyPrimaryStrategy", () => {
  it("single dominant strategy at ≥80% share -> that strategy, confident", () => {
    const result = classifyPrimaryStrategy(fakeIr([{ strategyId: "S-01", ruleCount: 9 }, { strategyId: "S-02", ruleCount: 1 }]), DEF)!;
    expect(result.value).toBe("S-01");
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.confidenceClass).toBe("confident");
    expect(result.consistency).toBeCloseTo(0.9, 6);
    expect(result.evidenceSize).toBe(10);
  });

  it("dominant below the confident bar -> that strategy, mixed confidence", () => {
    const result = classifyPrimaryStrategy(fakeIr([{ strategyId: "S-01", ruleCount: 3 }, { strategyId: "S-02", ruleCount: 1 }]), DEF)!;
    expect(result.value).toBe("S-01");
    expect(result.confidenceClass).toBe("mixed");
    expect(result.consistency).toBeCloseTo(0.75, 6);
  });

  it("honest tie -> 'mixed' with the tied set recorded, never silently resolved (FR-010)", () => {
    const result = classifyPrimaryStrategy(fakeIr([{ strategyId: "S-01", ruleCount: 4 }, { strategyId: "S-02", ruleCount: 4 }]), DEF)!;
    expect(result.value).toBe("mixed");
    expect(result.confidenceClass).toBe("mixed");
    expect(result.notes).toMatch(/tie/i);
    expect(result.notes).toMatch(/S-01/);
    expect(result.notes).toMatch(/S-02/);
  });

  it("patterns with no strategyId or zero owned rules are ignored", () => {
    const result = classifyPrimaryStrategy(fakeIr([{ strategyId: undefined, ruleCount: 5 }, { strategyId: "S-02", ruleCount: 0 }, { strategyId: "S-01", ruleCount: 2 }]), DEF)!;
    expect(result.value).toBe("S-01");
  });

  it("nothing recognized -> null (fall through to fallback)", () => {
    expect(classifyPrimaryStrategy(fakeIr([]), DEF)).toBeNull();
    expect(classifyPrimaryStrategy(fakeIr([{ strategyId: undefined, ruleCount: 3 }]), DEF)).toBeNull();
  });

  it("end-to-end: a real simple-swap keyboard resolves to S-01", () => {
    const kmn = `${HEADER}\n+ [K_A] > U+0627\n+ [K_S] > U+0628\n+ [K_D] > U+062C\n+ [K_F] > U+062F\n+ [K_G] > U+0065\n`;
    const { ir } = parse(kmn, "test-s01");
    recognizePatterns(ir);
    const result = classifyPrimaryStrategy(ir, DEF)!;
    expect(result.value).toBe("S-01");
    expect(result.provenanceTier).toBe("content-derived");
  });
});

describe("primaryStrategyFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = primaryStrategyFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.confidenceClass).toBe("undetermined");
    expect(result.value).toBeUndefined();
    expect(result.notes).toMatch(/undetermined/i);
  });
});
