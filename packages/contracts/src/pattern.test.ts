import { describe, it, expect } from "vitest";
import type { Pattern } from "./pattern";
import { ALL_STRATEGY_IDS } from "./strategy";

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

  it("ALL_STRATEGY_IDS exposes every S-01..S-12 id exactly once", () => {
    expect(ALL_STRATEGY_IDS).toHaveLength(12);
    expect(new Set(ALL_STRATEGY_IDS).size).toBe(12);
    expect(ALL_STRATEGY_IDS[0]).toBe("S-01");
    expect(ALL_STRATEGY_IDS[11]).toBe("S-12");
  });
});
