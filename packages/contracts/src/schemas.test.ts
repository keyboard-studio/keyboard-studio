// Runtime coverage for the zod contract schemas (schemas.ts). The compile-time
// drift guards in schemas.ts assert that each schema's inferred type stays
// assignable to its locked interface; these tests assert the complementary
// runtime direction — that the schemas accept every shipped fixture / data
// record (so they are not stricter than reality) and reject malformed input
// (so the guard actually bites at the load boundary).
//
// @see spec.md §5 (Pattern), §11 / §14 D4 (Criterion)

import { describe, it, expect } from "vitest";
import {
  PatternSchema,
  RawPatternSchema,
  CriterionSchema,
  RemovalCapabilitySchema,
} from "./schemas";
import { samplePatterns } from "./fixtures/patterns";
import { ALL_CRITERIA } from "./criteriaData";
import criteriaJsonRaw from "../data/criteria.json" with { type: "json" };

// -----------------------------------------------------------------------------
// PatternSchema — strict canonical schema (spec §5)
// -----------------------------------------------------------------------------

describe("PatternSchema (strict, spec §5)", () => {
  it("accepts every canonical fixture and round-trips it unchanged", () => {
    for (const p of samplePatterns) {
      const result = PatternSchema.safeParse(p);
      expect(result.success, result.success ? "" : JSON.stringify(result.error?.issues)).toBe(true);
      // Strict schema strips unknown keys; a clean fixture must survive
      // parsing byte-for-byte, proving no contract field is dropped.
      if (result.success) {
        expect(result.data).toEqual(p);
      }
    }
  });

  it("rejects a pattern missing a required field (kmnFragment)", () => {
    const { kmnFragment: _omit, ...broken } = samplePatterns[0]!;
    expect(PatternSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an out-of-vocabulary category", () => {
    const broken = { ...samplePatterns[0]!, category: "not-a-real-category" };
    expect(PatternSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an out-of-vocabulary strategyId", () => {
    const broken = { ...samplePatterns[0]!, strategyId: "S-99" };
    expect(PatternSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a wrongly-typed required field (tests must be an array)", () => {
    const broken = { ...samplePatterns[0]!, tests: "nope" };
    expect(PatternSchema.safeParse(broken).success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// RawPatternSchema — YAML-tolerant input schema (engine/studio loaders)
// -----------------------------------------------------------------------------

describe("RawPatternSchema (YAML-tolerant input)", () => {
  const rawYamlShaped = {
    id: 42, // numeric ids are authored in YAML
    title: "Raw",
    description: "raw input shape",
    category: "substitute", // raw directory name
    appliesTo: ["Latn"],
    questions: [],
    kmnFragment: "+ 'a' > 'b'",
    touchLayoutFragment: null, // explicit null = "no fragment"
    reorderRules: null,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: 0,
    reviewDate: 20260616, // numeric date is tolerated on the way in
    notes: "content-only key preserved by passthrough",
  };

  it("accepts numeric ids/dates, null fragments, and extra content-only keys", () => {
    const result = RawPatternSchema.safeParse(rawYamlShaped);
    expect(result.success, result.success ? "" : JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("still rejects input missing a structurally-required field", () => {
    const { kmnFragment: _omit, ...broken } = rawYamlShaped;
    expect(RawPatternSchema.safeParse(broken).success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// CriterionSchema — four-band discriminated union (spec §11 / §14 D4)
// -----------------------------------------------------------------------------

describe("CriterionSchema (spec §11)", () => {
  it("validates the entire shipped criteria.json catalog", () => {
    const result = CriterionSchema.array().safeParse(criteriaJsonRaw);
    expect(result.success, result.success ? "" : JSON.stringify(result.error?.issues?.slice(0, 5))).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(148);
    }
  });

  it("is the same catalog ALL_CRITERIA exposes (parsed at module load)", () => {
    // ALL_CRITERIA is produced by CriterionSchema.array().parse at import time;
    // if criteria.json had drifted, importing this module would already throw.
    expect(ALL_CRITERIA.length).toBe(148);
  });

  it("accepts each band variant with its own hook", () => {
    expect(
      CriterionSchema.safeParse({
        id: "1.1-x", section: "1. Test", description: "x", band: "scaffolder-bake", scaffolderRule: "strip-ncaps",
      }).success
    ).toBe(true);
    expect(
      CriterionSchema.safeParse({
        id: "1.2-x", section: "1. Test", description: "x", band: "layer-c-enforce", lintRuleId: "KM_LINT_X",
      }).success
    ).toBe(true);
  });

  it("rejects a record carrying a sibling band's hook", () => {
    // scaffolder-bake with a lintRuleId (and no scaffolderRule) must fail.
    const result = CriterionSchema.safeParse({
      id: "1.1-x", section: "1. Test", description: "x", band: "scaffolder-bake", lintRuleId: "KM_LINT_X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a record missing its band hook entirely", () => {
    const result = CriterionSchema.safeParse({
      id: "1.3-x", section: "1. Test", description: "x", band: "yellow-survey",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown band", () => {
    const result = CriterionSchema.safeParse({
      id: "1.5-x", section: "1. Test", band: "purple-haze", description: "x",
    });
    expect(result.success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// RemovalCapabilitySchema — five-value enum (carve-gallery removal classifier)
// -----------------------------------------------------------------------------

describe("RemovalCapabilitySchema", () => {
  const VALID_VALUES = [
    "removable:simple",
    "removable:slot-fill",
    "not-removable:opaque",
    "not-removable:context-sensitive",
    "not-removable:unknown",
  ] as const;

  it("accepts all five valid capability values", () => {
    for (const value of VALID_VALUES) {
      const result = RemovalCapabilitySchema.safeParse(value);
      expect(result.success, `expected ${value} to be valid`).toBe(true);
      if (result.success) {
        expect(result.data).toBe(value);
      }
    }
  });

  it("rejects an out-of-vocabulary value", () => {
    expect(RemovalCapabilitySchema.safeParse("removable:beep-insertion").success).toBe(false);
    expect(RemovalCapabilitySchema.safeParse("not-removable").success).toBe(false);
    expect(RemovalCapabilitySchema.safeParse("").success).toBe(false);
    expect(RemovalCapabilitySchema.safeParse(42).success).toBe(false);
  });
});
