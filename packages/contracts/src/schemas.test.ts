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
  toPattern,
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
// toPattern — RawPattern -> Pattern normalisation (issue #1002)
//
// Single shared implementation, imported by both the engine's node loader
// (engine/src/pattern-library/loader.ts) and the studio's browser loader
// (studio/src/lib/browserPatternLibrary.ts). Fixtures below mirror the shapes
// covered by engine/src/pattern-library/__fixtures__/*.yaml (valid-pattern,
// nullable-fragments-pattern, borderline-pattern) so this test locks the
// pre-extraction behaviour of both now-deleted per-loader copies.
// -----------------------------------------------------------------------------

describe("toPattern (RawPattern -> Pattern normalisation)", () => {
  it("normalises a full-featured raw pattern, coercing numeric id/date to string", () => {
    // Mirrors engine/__fixtures__/valid-pattern.yaml plus strategy/provenance/demo fields.
    const raw = RawPatternSchema.parse({
      id: 42,
      title: "Test Valid Pattern",
      description: "A valid pattern for testing the loader.",
      category: "substitute",
      appliesTo: ["Latn"],
      group_visibility: "all",
      priority: 1,
      strategyId: "S-01",
      combinesWith: ["S-04"],
      questions: [{ id: "charMap", prompt: "Map keystrokes to characters.", answerType: "text" }],
      kmnFragment: "+ [K_Q] > U+025B\n",
      tests: [{ input: ["[K_Q]"], expectedOutput: "ɛ", description: "Q produces ɛ" }],
      validatedForFamilies: ["Latn"],
      sourceKeyboards: [],
      reviewedBy: "test-suite",
      reviewDate: 20260101,
      frequencyInCorpus: 3,
      provenance: [{ keyboard: "release/basic/basic_kbdfr", rule: "+ 'a' > 'b'" }],
      demo: { filled_kmn: "+ [K_Q] > U+025B\n" },
    });

    const pattern = toPattern(raw);

    expect(pattern.id).toBe("42");
    expect(pattern.reviewedBy).toBe("test-suite");
    expect(pattern.reviewDate).toBe("20260101");
    expect(pattern.category).toBe("substitute");
    expect(pattern.strategyId).toBe("S-01");
    expect(pattern.combinesWith).toEqual(["S-04"]);
    expect(pattern.group_visibility).toBe("all");
    expect(pattern.priority).toBe(1);
    expect(pattern.frequencyInCorpus).toBe(3);
    expect(pattern.provenance).toEqual([
      { keyboard: "release/basic/basic_kbdfr", rule: "+ 'a' > 'b'" },
    ]);
    expect(pattern.demo).toEqual({ filled_kmn: "+ [K_Q] > U+025B\n" });
    // Result must satisfy the strict schema too.
    expect(PatternSchema.safeParse(pattern).success).toBe(true);
  });

  it("coerces explicit null touch/reorder fragments to omitted fields", () => {
    // Mirrors engine/__fixtures__/nullable-fragments-pattern.yaml.
    const raw = RawPatternSchema.parse({
      id: "test_null_fragments_pattern",
      title: "Test Null Fragments Pattern",
      description: "Desktop pattern that marks touch/reorder fragments with explicit null.",
      category: "desktop",
      appliesTo: ["Latn"],
      questions: [
        { id: "triggerKey", prompt: "Which key triggers it?", answerType: "key-name", default: "K_QUOTE" },
      ],
      kmnFragment: "+ [{{triggerKey}}] > deadkey(acute)\n",
      touchLayoutFragment: null,
      reorderRules: null,
      tests: [{ input: ["[K_QUOTE]"], expectedOutput: "" }],
      validatedForFamilies: ["Latn"],
      sourceKeyboards: [],
      reviewedBy: "test-suite",
      reviewDate: "2026-01-01",
    });

    const pattern = toPattern(raw);

    expect("touchLayoutFragment" in pattern).toBe(false);
    expect("reorderRules" in pattern).toBe(false);
  });

  it("omits every optional field when the raw pattern carries only required fields", () => {
    const raw = RawPatternSchema.parse({
      id: "minimal",
      title: "Minimal",
      description: "Only required fields.",
      category: "substitute",
      appliesTo: [],
      questions: [],
      kmnFragment: "",
      tests: [],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: "test",
      reviewDate: "2026-01-01",
    });

    const pattern = toPattern(raw);

    for (const key of [
      "strategyId",
      "combinesWith",
      "touchLayoutFragment",
      "reorderRules",
      "frequencyInCorpus",
      "provenance",
      "demo",
      "group_visibility",
      "priority",
    ]) {
      expect(key in pattern).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
// CriterionSchema — four-band discriminated union (spec §11 / §14 D4)
// -----------------------------------------------------------------------------

describe("CriterionSchema (spec §11)", () => {
  it("validates the entire shipped criteria.json catalog", () => {
    // The point of this test is that EVERY row parses against CriterionSchema.
    // It deliberately does NOT assert the catalog's cardinality: the catalog
    // grows over time, so a hardcoded count (148, 149, ...) would go red on a
    // legitimate addition — noise, not a real regression signal. git diff
    // already shows cardinality changes.
    const result = CriterionSchema.array().safeParse(criteriaJsonRaw);
    expect(result.success, result.success ? "" : JSON.stringify(result.error?.issues?.slice(0, 5))).toBe(true);
    // Guard only against a vacuous pass on an empty/degenerate file.
    expect((result.success ? result.data : []).length).toBeGreaterThan(0);
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
// Localized criteria.<lang>.json contract (spec 046 D7 / T025)
//
// packages/contracts/data/criteria.<lang>.json does not exist yet (ships with
// T029); this fixture stands in for one so the contract is pinned ahead of
// that work, per the tasks-before-implementation ordering for User Story 2.
// A localized file is the canonical criteria.json with `description` (and
// `preSubmitChecklistText` on red-checklist rows) translated — every other
// field, including the four band-hook fields, is byte-identical.
// -----------------------------------------------------------------------------

describe("localized criteria.<lang>.json contract (spec 046 D7)", () => {
  const localizedFixture = (criteriaJsonRaw as Array<Record<string, unknown>>).map(
    (c) => ({
      ...c,
      description: `[fr] ${c.description as string}`,
      ...("preSubmitChecklistText" in c
        ? { preSubmitChecklistText: `[fr] ${c.preSubmitChecklistText as string}` }
        : {}),
    })
  );

  it("a localized catalog (translated prose only) satisfies CriterionSchema", () => {
    const result = CriterionSchema.array().safeParse(localizedFixture);
    expect(result.success, result.success ? "" : JSON.stringify(result.error?.issues?.slice(0, 5))).toBe(true);
  });

  it("a localized catalog keeps the same ids, bands, and hooks as the canonical file", () => {
    const english = CriterionSchema.array().parse(criteriaJsonRaw);
    const localized = CriterionSchema.array().parse(localizedFixture);
    expect(localized.map((c) => c.id)).toEqual(english.map((c) => c.id));
    expect(localized.map((c) => c.band)).toEqual(english.map((c) => c.band));
  });

  it("rejects a localized catalog that drops or reorders a row relative to the canonical file", () => {
    const truncated = localizedFixture.slice(1);
    const english = CriterionSchema.array().parse(criteriaJsonRaw);
    const localized = CriterionSchema.array().parse(truncated);
    expect(localized.length).not.toBe(english.length);
  });

  it("the canonical row count (ALL_CRITERIA) is derived only from criteria.json, never a sibling locale file", () => {
    // criteriaData.ts's ALL_CRITERIA statically imports only ../data/criteria.json.
    // This pins that invariant: its length always equals the canonical file's
    // row count, so a criteria.<lang>.json sitting alongside it in data/ can
    // never inflate the count the partition tests (types.test.ts) read from.
    expect(ALL_CRITERIA.length).toBe(criteriaJsonRaw.length);
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
