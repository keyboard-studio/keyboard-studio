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
  EditorActionSummarySchema,
  DecisionImpactSchema,
  DecisionEntrySchema,
  toPattern,
} from "./schemas";
import { samplePatterns } from "./fixtures/patterns";
import criteriaJsonRaw from "../data/criteria.json" with { type: "json" };
import { EDITOR_ACTION_SAMPLE_LIMIT, DECISION_DIFF_CONTEXT_LINES } from "./decisionRecord";

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

// -----------------------------------------------------------------------------
// EditorActionSummarySchema — absence is UNMEASURED, never coerced to 0
// (specs/055-legible-decision-trail FR-005/FR-005a, contract §2).
//
// A `.default(0)` regression would make an absent count indistinguishable
// from a genuinely-measured-and-zero one, which is exactly the bug FR-005a
// forbids and exactly the thing a naive falsy check (`if (!summary.keysRemoved)`)
// would fail to catch. These tests assert on absence directly — `in` plus
// `toBeUndefined()` — and separately assert the converse, that a present `0`
// is neither dropped nor rewritten.
// -----------------------------------------------------------------------------

describe("EditorActionSummarySchema (specs/055 contract §2 — absence is not zero)", () => {
  const COUNT_FIELDS = [
    "keysRemoved",
    "keysAdded",
    "mechanismsAssigned",
    "touchKeysAffected",
  ] as const;

  it.each(COUNT_FIELDS)("parses with %s absent and keeps it absent, not coerced to 0", (field) => {
    const input = { sample: [], sampleTruncated: false };
    const result = EditorActionSummarySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Two independent assertions: a `.default(0)` regression would make
    // `field in result.data` true (with value 0), so checking `in` catches it
    // even though `result.data[field]` alone would also flag it via `toBe(0)`
    // instead of `toBeUndefined()` — belt and suspenders against either shape
    // of the coercion bug.
    expect(field in result.data).toBe(false);
    expect(result.data[field]).toBeUndefined();
  });

  it.each(COUNT_FIELDS)("parses with %s present as 0 and keeps 0 (measured, unchanged), not dropped", (field) => {
    const input = { sample: [], sampleTruncated: false, [field]: 0 };
    const result = EditorActionSummarySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(field in result.data).toBe(true);
    expect(result.data[field]).toBe(0);
  });

  it("rejects a negative count", () => {
    const input = { sample: [], sampleTruncated: false, keysRemoved: -1 };
    expect(EditorActionSummarySchema.safeParse(input).success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// DecisionImpact — the "captured" variant, DecisionFileChange, and sharedWith
// (specs/055-legible-decision-trail contract §3).
// -----------------------------------------------------------------------------

describe('DecisionImpactSchema "captured" variant (specs/055 contract §3)', () => {
  const sampleHunk = {
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 1,
    lines: ["-old", "+new"],
  };
  const sampleFile = {
    path: "source/foo.kmn",
    hunks: [sampleHunk],
    magnitude: { added: 1, removed: 1 },
  };

  it("accepts a captured impact with at least one changed file", () => {
    const input = {
      state: "captured",
      files: [sampleFile],
      magnitude: { added: 1, removed: 1 },
    };
    expect(DecisionImpactSchema.safeParse(input).success).toBe(true);
  });

  it(
    'rejects a captured impact whose files array is empty (contract §3: zero changed ' +
      'files is the separate { state: "none" } variant, not an empty capture)',
    () => {
      const input = {
        state: "captured",
        files: [],
        magnitude: { added: 0, removed: 0 },
      };
      expect(DecisionImpactSchema.safeParse(input).success).toBe(false);
    },
  );

  it('accepts { state: "none" } as the way to say zero changed files', () => {
    expect(DecisionImpactSchema.safeParse({ state: "none" }).success).toBe(true);
  });

  it('accepts { state: "unavailable" } with a valid reason', () => {
    expect(
      DecisionImpactSchema.safeParse({ state: "unavailable", reason: "lock-gate-dependency" }).success,
    ).toBe(true);
  });

  it("sharedWith is optional on a captured impact (absent means solely responsible)", () => {
    const input = {
      state: "captured",
      files: [sampleFile],
      magnitude: { added: 1, removed: 1 },
    };
    const result = DecisionImpactSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && result.data.state === "captured") {
      expect("sharedWith" in result.data).toBe(false);
    }
  });

  // Contract §6: "sharedWith is written as part of the impact attach, which is
  // already the one write-after-the-fact." That places "an entry never names
  // itself" (contract §3) at the producer that attaches impact to an entry —
  // the one place that has both the entry's own `entryId` and the `sharedWith`
  // list in scope at once. `DecisionImpactSchema` validates the impact object
  // in isolation and never sees the owning entry's id, and `DecisionEntrySchema`
  // (below) has no cross-field refinement wiring the two together either. This
  // test pins that scope deliberately: the schema layer is NOT where this
  // invariant should be enforced, so it must not silently start rejecting a
  // same-shaped id here — that would be the wrong layer catching it, invisibly,
  // while the real producer boundary stays unguarded.
  it("does not reject sharedWith at the schema layer even when a value matches the owning entryId (self-exclusion is a producer-level invariant, contract §6 — see note below)", () => {
    const ownId = "entry-123";
    const impact = {
      state: "captured",
      files: [sampleFile],
      magnitude: { added: 1, removed: 1 },
      sharedWith: [ownId],
    };
    expect(DecisionImpactSchema.safeParse(impact).success).toBe(true);

    const entry = {
      entryId: ownId,
      stepId: "step-1",
      payload: { kind: "editor-action", actionType: "gallery_edit", summary: { sample: [], sampleTruncated: false } },
      provenance: { agency: "hand-set" as const },
      recordedAt: 0,
      supersedes: null,
      impact,
    };
    expect(DecisionEntrySchema.safeParse(entry).success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Regression pins (specs/055-legible-decision-trail contract §2/§3/§6) — these
// two literals are shared between the recorder and its tests specifically so
// they cannot drift apart; a change here is either a deliberate contract edit
// (with the contract md updated in the same commit) or a regression.
// -----------------------------------------------------------------------------

describe("Decision-record numeric regression pins", () => {
  it("EDITOR_ACTION_SAMPLE_LIMIT stays 12", () => {
    expect(EDITOR_ACTION_SAMPLE_LIMIT).toBe(12);
  });

  it("DECISION_DIFF_CONTEXT_LINES stays 3", () => {
    expect(DECISION_DIFF_CONTEXT_LINES).toBe(3);
  });
});
