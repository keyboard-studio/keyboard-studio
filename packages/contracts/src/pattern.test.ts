import { describe, it, expect } from "vitest";
import type { Pattern, AnswerType } from "./pattern";
import { makePattern } from "./pattern";
import type { DiscoveryAxisVector } from "./axes";
import type { PatternMatch } from "./patternMatch";
import { ALL_STRATEGY_IDS } from "./strategy";
import { makeCompileResult } from "./compileResult";

describe("Pattern", () => {
  it("constructs the spec section 6 worked example (latin_deadkey_acute_single)", () => {
    const pattern: Pattern = {
      id: "latin_deadkey_acute_single",
      title: "Tap, then a base letter, gives an accented version",
      description:
        "A single apostrophe or backtick (the trigger key) followed by a base letter produces the precomposed accented form.",
      category: "desktop",
      appliesTo: [],
      strategyId: "S-02",
      combinesWith: ["S-04"],
      questions: [
        {
          id: "triggerKey",
          prompt: "Which key acts as the accent trigger?",
          answerType: "key-name",
          default: "K_QUOTE",
        },
        {
          id: "accentChar",
          prompt: "Which combining accent mark do you want?",
          answerType: "char-single",
          default: "́",
        },
        {
          id: "baseLetters",
          prompt: "Which base letters take this accent?",
          answerType: "char-list",
        },
        {
          id: "accentedForms",
          prompt: "List the accented forms in the same order as the base letters.",
          answerType: "char-list",
        },
      ],
      kmnFragment:
        "store(dk_acute_bases)  '{{baseLetters}}'\nstore(dk_acute_output) '{{accentedForms}}'\n\n+ [{{triggerKey}}] > deadkey(acute)\ndeadkey(acute) + any(dk_acute_bases) > index(dk_acute_output, 2)\ndeadkey(acute) + [{{triggerKey}}] > '{{accentChar}}'\n",
      touchLayoutFragment:
        '{\n  "sk": [\n    { "id": "{{accentChar}}", "text": "{{accentChar}}" }\n  ]\n}\n',
      tests: [
        {
          input: ["K_QUOTE", "K_A"],
          expectedOutput: "á",
          description: "apostrophe + a produces a-acute (U+00E1)",
        },
        {
          input: ["K_QUOTE", "K_E"],
          expectedOutput: "é",
          description: "apostrophe + e produces e-acute (U+00E9)",
        },
      ],
      validatedForFamilies: ["Latn"],
      sourceKeyboards: ["release/basic/basic_kbdfr", "release/sil/sil_euro_latin"],
      reviewedBy: "keyboard-studio-content-team",
      reviewDate: "2026-06-02",
    };

    expect(pattern.id).toBe("latin_deadkey_acute_single");
    expect(pattern.category).toBe("desktop");
    expect(pattern.appliesTo).toEqual([]);
    expect(pattern.strategyId).toBe("S-02");
    expect(pattern.combinesWith).toEqual(["S-04"]);
    expect(pattern.questions).toHaveLength(4);
    expect(pattern.tests[0]?.expectedOutput).toBe("á");
  });

  it("ALL_STRATEGY_IDS exposes every S-01..S-13 id exactly once", () => {
    expect(ALL_STRATEGY_IDS).toHaveLength(13);
    expect(new Set(ALL_STRATEGY_IDS).size).toBe(13);
    const first = ALL_STRATEGY_IDS[0]!;
    expect(first).toBe("S-01");
    const last = ALL_STRATEGY_IDS[12]!;
    expect(last).toBe("S-13");
  });

  // (a) non-empty appliesTo array on a constructed Pattern
  it("makePattern: non-empty appliesTo array is preserved", () => {
    const p = makePattern({
      id: "deva_test",
      title: "Devanagari test",
      description: "Test pattern restricted to Devanagari.",
      category: "desktop",
      appliesTo: ["Deva", "release/sil/sil_devanagari_phonetic"],
      questions: [],
      kmnFragment: "",
      tests: [],
      validatedForFamilies: ["Deva"],
      sourceKeyboards: [],
      reviewedBy: "test",
      reviewDate: "2026-06-02",
    });
    expect(p.appliesTo).toHaveLength(2);
    expect(p.appliesTo[0]).toBe("Deva");
    expect(p.appliesTo[1]).toBe("release/sil/sil_devanagari_phonetic");
  });

  // (b) AnswerType exhaustiveness - satisfies check across all members
  it("AnswerType covers all expected literals", () => {
    const allAnswerTypes = [
      "char-list",
      "char-single",
      "key-name",
      "store-content",
      "boolean",
      "select",
      "text",
    ] as const satisfies readonly AnswerType[];
    expect(allAnswerTypes).toHaveLength(7);
  });

  // (c) DiscoveryAxisVector construction with renamed camelCase fields
  it("DiscoveryAxisVector uses camelCase field names", () => {
    const vec: DiscoveryAxisVector = {
      scale: "medium",
      scriptClass: "alphabetic",
      clusterSensitivity: false,
      phoneticIntuition: "strong",
      markInputOrder: "prefix",
      diacriticBehavior: "stacking-combining",
      multiMode: "single",
      constraintEnforcement: "none",
      spareKeyAvailability: "many",
      remapPosture: "addition",
    };
    expect(vec.scale).toBe("medium");
    expect(vec.scriptClass).toBe("alphabetic");
    expect(vec.clusterSensitivity).toBe(false);
    expect(vec.phoneticIntuition).toBe("strong");
    expect(vec.diacriticBehavior).toBe("stacking-combining");
    expect(vec.multiMode).toBe("single");
    expect(vec.constraintEnforcement).toBe("none");
    expect(vec.spareKeyAvailability).toBe("many");
    expect(vec.remapPosture).toBe("addition");
    expect(vec.markInputOrder).toBe("prefix");
  });

  // (d) PatternMatch construction with strategyId both absent and present
  it("PatternMatch accepts strategyId as optional", () => {
    const withStrategy: PatternMatch = {
      patternId: "latin_deadkey_acute_single",
      strategyId: "S-02",
      rank: 1,
      reason: "primary-strategy",
    };
    expect(withStrategy.strategyId).toBe("S-02");

    const withoutStrategy: PatternMatch = {
      patternId: "latin_deadkey_acute_single",
      rank: 1,
      reason: "appliesTo-match",
    };
    expect(withoutStrategy.strategyId).toBeUndefined();
  });

  // (e) Guarded ALL_STRATEGY_IDS index access (noUncheckedIndexedAccess)
  it("ALL_STRATEGY_IDS index access is guarded", () => {
    const first = ALL_STRATEGY_IDS[0]!;
    const last = ALL_STRATEGY_IDS[ALL_STRATEGY_IDS.length - 1]!;
    expect(first).toBe("S-01");
    expect(last).toBe("S-13");
  });
});

describe("makePattern optional-field handling (#78)", () => {
  const requiredOnly = {
    id: "x",
    title: "x",
    description: "x",
    category: "desktop" as const,
    appliesTo: [] as string[],
    questions: [],
    kmnFragment: "",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-02",
  };

  it("strips undefined optional fields from the result object", () => {
    const p = makePattern(requiredOnly);
    // Under exactOptionalPropertyTypes, omitted optionals must be ABSENT
    // from the result, not present-but-undefined.
    expect("strategyId" in p).toBe(false);
    expect("combinesWith" in p).toBe(false);
    expect("touchLayoutFragment" in p).toBe(false);
    expect("reorderRules" in p).toBe(false);
  });

  it("preserves optional fields when provided", () => {
    const p = makePattern({
      ...requiredOnly,
      strategyId: "S-02",
      combinesWith: ["S-04"],
      touchLayoutFragment: "{}",
      reorderRules: "// no reorder\n",
    });
    expect(p.strategyId).toBe("S-02");
    expect(p.combinesWith).toEqual(["S-04"]);
    expect(p.touchLayoutFragment).toBe("{}");
    expect(p.reorderRules).toBe("// no reorder\n");
  });
});

describe("makePattern — origin and ownedNodes", () => {
  const base = {
    id: "x",
    title: "x",
    description: "x",
    category: "desktop" as const,
    appliesTo: [] as string[],
    questions: [],
    kmnFragment: "",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-02",
  };

  it("preserves origin and ownedNodes when provided", () => {
    const p = makePattern({
      ...base,
      origin: "recognized",
      ownedNodes: [{ kind: "rule", nodeId: "r1" }],
    });
    expect(p.origin).toBe("recognized");
    expect(p.ownedNodes).toEqual([{ kind: "rule", nodeId: "r1" }]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("omits origin and ownedNodes when not provided", () => {
    const p = makePattern(base);
    expect(p).not.toHaveProperty("origin");
    expect(p).not.toHaveProperty("ownedNodes");
  });
});

describe("makeCompileResult", () => {
  it("returns a shape-conforming CompileResult", () => {
    const r = makeCompileResult({
      success: true,
      artifacts: [
        { filename: "foo.kmx", url: "blob:mock", sizeBytes: 1024 },
      ],
      diagnostics: [],
      compileMs: 137,
      isWarmCompile: true,
    });
    expect(r.success).toBe(true);
    expect(r.artifacts).toHaveLength(1);
    expect(r.diagnostics).toEqual([]);
    expect(r.compileMs).toBe(137);
    expect(r.isWarmCompile).toBe(true);
  });

  it("preserves all required fields verbatim (no field drop)", () => {
    const r = makeCompileResult({
      success: false,
      artifacts: [],
      diagnostics: [
        {
          code: "KM_ERROR_TEST",
          severity: "error",
          layer: "A",
          message: "test diagnostic",
        },
      ],
      compileMs: 200,
      isWarmCompile: false,
    });
    expect(r.success).toBe(false);
    expect(r.artifacts).toEqual([]);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]?.code).toBe("KM_ERROR_TEST");
    expect(r.compileMs).toBe(200);
    expect(r.isWarmCompile).toBe(false);
  });
});
