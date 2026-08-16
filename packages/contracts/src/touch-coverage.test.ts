/**
 * Unit tests for computeTouchCoverage / decodeUnicodeKeyId (spec 035,
 * FR-008/SC-003; multi-codepoint U_ ids per review-gate item 2).
 *
 * Locks the pattern behind the contract, not just one instance:
 *   - each producer mechanism (text/output, sk, flick, multitap) counts
 *   - layer reachability (default, nextlayer chain, cycle guard, unreachable)
 *   - NFC/NFD normalization
 *   - star-labels are never producers
 *   - exactly-once reporting + fully-covered empty case
 *   - multi-codepoint U_ ids (Keyman 15+) decode and count for coverage
 *   - a malformed hex group anywhere in a multi-codepoint id is not decoded
 */

import { describe, it, expect } from "vitest";
import {
  computeTouchCoverage,
  decodeUnicodeKeyId,
  isDeadkeyStyledKeyClass,
  isFrameKeyClass,
  isSpacerKeyClass,
  stripDottedCircle,
} from "./touch-coverage.js";
import type { TouchLayoutIR, TouchKeyIR } from "./keyboard-ir.js";
import { buildTouchKeyRuleIndex } from "./touch-key-rule-join.js";
import { makeTestIR } from "./fixtures/keyboard-ir.js";

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

/** Build a TouchLayoutIR with a single "phone" platform from the given layers. */
function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("computeTouchCoverage", () => {
  it("reports an orphaned inventory char exactly once", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["a", "z", "z"]);

    expect(result.uncovered).toEqual(["z", "z"]);
  });

  it("counts coverage via an sk (longpress) entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                sk: [makeKey("K_A_acute", { text: "á" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = computeTouchCoverage(layout, ["á"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a flick[direction] entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                flick: { ne: makeKey("K_A_ne", { text: "â" }) },
              }),
            ],
          },
        ],
      },
    ]);

    const result = computeTouchCoverage(layout, ["â"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a multitap entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                multitap: [makeKey("K_A_mt", { text: "ã" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = computeTouchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("marks a char on a layer with no nextlayer chain from default as uncovered", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
      // "shift" is never referenced by any nextlayer from "default".
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual(["A"]);
  });

  it("counts a nextlayer-reachable layer's chars as covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not hang on a cycle in nextlayer references", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_TO_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      {
        id: "shift",
        rows: [
          {
            keys: [
              makeKey("K_A_shift", { text: "A" }),
              makeKey("K_TO_DEFAULT", { text: "*Default*", nextlayer: "default" }),
            ],
          },
        ],
      },
    ]);

    const result = computeTouchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("covers an NFC inventory char from an NFD-stored layout string", () => {
    // "e" + combining acute accent (U+0065 U+0301), NFD form of "é".
    const nfdText = "é";
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_E_ACUTE", { text: nfdText })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["é"]);

    expect(result.uncovered).toEqual([]);
  });

  it("returns an empty uncovered list when everything is covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_A", { text: "a" }), makeKey("K_B", { text: "b" })] }],
      },
    ]);

    const result = computeTouchCoverage(layout, ["a", "b"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a star-label as producing its letters", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["S"]);

    expect(result.uncovered).toEqual(["S"]);
  });

  it("decodes a U_XXXX key id into the char it encodes", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_00E7")] }] },
    ]);

    const result = computeTouchCoverage(layout, ["ç"]);

    expect(result.uncovered).toEqual([]);
  });

  it("decodes a multi-codepoint U_ id (base + combining mark) as its NFC char", () => {
    // U_0061_0303 = "a" (U+0061) + combining tilde (U+0303) -> NFC "ã" (U+00E3).
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_0061_0303")] }] },
    ]);

    const result = computeTouchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a spacer key (sp:10) as a producer", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("T_sp", { text: "a", sp: 10 })] }],
      },
    ]);

    const result = computeTouchCoverage(layout, ["a"]);

    expect(result.uncovered).toEqual(["a"]);
  });
});

describe("decodeUnicodeKeyId", () => {
  it("decodes a single-group id", () => {
    expect(decodeUnicodeKeyId("U_0061")).toBe("a");
  });

  it("decodes a multi-codepoint id by concatenating each group's char (no NFC folding)", () => {
    // "a" (U+0061) + combining tilde (U+0303) -- the RAW concatenation, not
    // NFC-folded. NFC-folding is the caller's job (both consumers normalize
    // on insertion/comparison), so this locks decode as a pure per-group
    // concatenation.
    expect(decodeUnicodeKeyId("U_0061_0303")).toBe("a" + "̃");
  });

  it("returns undefined for a non-U_ id", () => {
    expect(decodeUnicodeKeyId("K_A")).toBeUndefined();
  });

  it("returns undefined when any group in a multi-codepoint id is malformed", () => {
    expect(decodeUnicodeKeyId("U_0061_ZZZZ")).toBeUndefined();
    expect(decodeUnicodeKeyId("U_0061_")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Spec 063 T025 — the coverage regression locks.
//
// Every existing test above calls the TWO-ARGUMENT form, and they all still
// pass. That is the point: the options argument is additive, so the whole suite
// above doubles as the byte-identical-behaviour lock. The tests below add the
// explicit statement of that plus the new behaviours.
// ---------------------------------------------------------------------------

/** Build a minimal IR carrying one rule keyed on `keyId` that outputs `text`. */
function irWithRule(keyId: string, text: string) {
  return makeTestIR([
    {
      nodeId: "group#main",
      name: "Main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: `rule#${keyId}`,
          context: [{ kind: "vkey", name: keyId, modifiers: [] }],
          output: [...text].map((value) => ({ kind: "char" as const, value })),
        },
      ],
    },
  ]);
}

describe("computeTouchCoverage — the options argument is additive (FR-005)", () => {
  const layout = () =>
    makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_0300", { text: "◌̀" })] }] },
    ]);

  it("a two-argument call is identical to passing an empty options object", () => {
    const inventory = ["a", "̀", "◌"];
    expect(computeTouchCoverage(layout(), inventory)).toEqual(
      computeTouchCoverage(layout(), inventory, {}),
    );
  });

  it("credits U+0300 for a T_0300 key ONLY when the rule index is passed", () => {
    // The whole US1 defect in one assertion. Without the index the key's output
    // lives in a rule the coverage walk cannot see; with it, the key is credited.
    const withoutIndex = computeTouchCoverage(layout(), ["̀"], { stripDottedCircle: false });
    expect(withoutIndex.uncovered).toEqual(["̀"]);

    const ruleIndex = buildTouchKeyRuleIndex(irWithRule("T_0300", "̀"));
    const withIndex = computeTouchCoverage(layout(), ["̀"], {
      ruleIndex,
      stripDottedCircle: false,
    });
    expect(withIndex.uncovered).toEqual([]);
  });

  it("credits a K_ key's rule output too — the same defect on a physical key", () => {
    const physical = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_QUOTE", { text: "◌̀" })] }] },
    ]);
    const ruleIndex = buildTouchKeyRuleIndex(irWithRule("K_QUOTE", "̀"));
    expect(
      computeTouchCoverage(physical, ["̀"], { ruleIndex, stripDottedCircle: false }).uncovered,
    ).toEqual([]);
  });

  it("credits a sub-key's rule output — the index is passed down into sk", () => {
    const nested = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("T_HOST", { text: "h", sk: [makeKey("T_SUB", { text: "s" })] }),
            ],
          },
        ],
      },
    ]);
    const ruleIndex = buildTouchKeyRuleIndex(irWithRule("T_SUB", "ŝ"));
    expect(computeTouchCoverage(nested, ["ŝ"], { ruleIndex }).uncovered).toEqual([]);
    // …and without the index it stays uncovered, so the assertion above is not
    // passing for some unrelated reason.
    expect(computeTouchCoverage(nested, ["ŝ"]).uncovered).toEqual(["ŝ"]);
  });

  it("does NOT credit a guard rule's re-emitted context as production", () => {
    // A `> context` guard produces nothing. Crediting it would make Cameroon's
    // guard-first idiom over-credit every mark key twice over.
    const ir = makeTestIR([
      {
        nodeId: "group#main",
        name: "Main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "rule#guard",
            context: [
              { kind: "any", storeRef: "diablock" },
              { kind: "raw", text: "+" },
              { kind: "vkey", name: "T_0300", modifiers: [] },
            ],
            output: [{ kind: "raw", text: "context" }],
          },
        ],
      },
    ]);
    const ruleIndex = buildTouchKeyRuleIndex(ir);
    expect(
      computeTouchCoverage(layout(), ["̀"], { ruleIndex, stripDottedCircle: false }).uncovered,
    ).toEqual(["̀"]);
  });
});

describe("stripDottedCircle — additive and narrow (FR-006)", () => {
  it("strips a mark keycap to its bare mark", () => {
    expect(stripDottedCircle("◌̀")).toBe("̀");
  });

  it("does NOT strip a bare dotted circle to empty", () => {
    // Load-bearing: sil_cameroon_qwerty's store(letter) ends in a literal ◌, so
    // U+25CC is a real inventory character on that keyboard. Stripping it to
    // nothing would make a genuinely covered character read as uncovered.
    expect(stripDottedCircle("◌")).toBeUndefined();
    expect(stripDottedCircle("◌◌")).toBeUndefined();
  });

  it("leaves a mixed letter/placeholder keycap untouched", () => {
    expect(stripDottedCircle("a◌b")).toBeUndefined();
  });

  it("returns undefined when there is no dotted circle at all", () => {
    expect(stripDottedCircle("a")).toBeUndefined();
    expect(stripDottedCircle("̀")).toBeUndefined();
  });

  it("handles a multi-mark keycap", () => {
    expect(stripDottedCircle("◌̀̈")).toBe("̀̈");
  });
});

describe("computeTouchCoverage — the U+25CC strip in situ", () => {
  it("credits BOTH the unstripped and stripped forms, never one instead of the other", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_0300", { text: "◌̀" })] }] },
    ]);
    // The bare mark is credited by the strip …
    expect(computeTouchCoverage(layout, ["̀"]).uncovered).toEqual([]);
    // … and the full keycap string is still credited as before.
    expect(computeTouchCoverage(layout, ["◌̀".normalize("NFC")]).uncovered).toEqual([]);
  });

  it("a bare ◌ keycap still covers U+25CC and is not stripped away", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_DOTTED", { text: "◌" })] }] },
    ]);
    expect(computeTouchCoverage(layout, ["◌"]).uncovered).toEqual([]);
  });

  it("can be turned off, and then the mark is uncovered again", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_0300", { text: "◌̀" })] }] },
    ]);
    expect(
      computeTouchCoverage(layout, ["̀"], { stripDottedCircle: false }).uncovered,
    ).toEqual(["̀"]);
  });

  it("does not strip a `*`-prefixed frame label", () => {
    // Frame labels are never producers; the strip must not sneak one in.
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_FRAME", { text: "*◌̀*" })] }] },
    ]);
    expect(computeTouchCoverage(layout, ["̀"]).uncovered).toEqual(["̀"]);
  });
});

describe("computeTouchCoverage — the corrected sp enum (FR-012)", () => {
  it("credits a deadkey-styled sp:8 key — it is interactive, not a spacer", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_DK", { text: "ə", sp: 8 })] }] },
    ]);
    expect(computeTouchCoverage(layout, ["ə"]).uncovered).toEqual([]);
  });

  it("does NOT credit a blank sp:9 key's keycap text", () => {
    // Cameroon's T_BLANK sites carry " ", so the old {8,10} reading spuriously
    // credited a space as covered while treating sp:8 keys as inert.
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_BLANK", { text: " ", sp: 9 })] }] },
    ]);
    expect(computeTouchCoverage(layout, [" "]).uncovered).toEqual([" "]);
  });

  it("does NOT credit a spacer sp:10 key", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_SPACER", { text: "x", sp: 10 })] }] },
    ]);
    expect(computeTouchCoverage(layout, ["x"]).uncovered).toEqual(["x"]);
  });

  it("does not credit an sp:9 key's RULE output either — the class short-circuits first", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_BLANK", { text: " ", sp: 9 })] }] },
    ]);
    const ruleIndex = buildTouchKeyRuleIndex(irWithRule("T_BLANK", "z"));
    expect(computeTouchCoverage(layout, ["z"], { ruleIndex }).uncovered).toEqual(["z"]);
  });

  it("the two class predicates partition the enum tail as documented", () => {
    expect(isSpacerKeyClass(9)).toBe(true);
    expect(isSpacerKeyClass(10)).toBe(true);
    expect(isSpacerKeyClass(8)).toBe(false);
    expect(isDeadkeyStyledKeyClass(8)).toBe(true);
    expect(isDeadkeyStyledKeyClass(9)).toBe(false);
    for (const sp of [0, 1, 2]) {
      expect(isSpacerKeyClass(sp)).toBe(false);
      expect(isDeadkeyStyledKeyClass(sp)).toBe(false);
    }
    expect(isSpacerKeyClass(undefined)).toBe(false);
    expect(isDeadkeyStyledKeyClass(undefined)).toBe(false);
  });

  it("isFrameKeyClass claims exactly {1, 2}, and is disjoint from the other two", () => {
    expect(isFrameKeyClass(1)).toBe(true);
    expect(isFrameKeyClass(2)).toBe(true);
    // 0 is the wire default (character), and `undefined` means the same — so
    // neither is a frame class. That matters for the family-parallelism
    // trigger, which reads an absent `sp` as "not frame" rather than "unknown".
    expect(isFrameKeyClass(0)).toBe(false);
    expect(isFrameKeyClass(undefined)).toBe(false);
    for (const sp of [8, 9, 10]) {
      expect(isFrameKeyClass(sp)).toBe(false);
    }
    for (const sp of [1, 2]) {
      expect(isSpacerKeyClass(sp)).toBe(false);
      expect(isDeadkeyStyledKeyClass(sp)).toBe(false);
    }
  });
});

describe("computeTouchCoverage — multi-char behaviour", () => {
  it("credits a multi-char keycap as its whole string, not per codepoint", () => {
    // Pre-existing behaviour, pinned here because the rule-index path adds a
    // per-codepoint credit alongside it and the two must not be confused.
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_FCFA", { text: "FCFA" })] }] },
    ]);
    expect(computeTouchCoverage(layout, ["FCFA"]).uncovered).toEqual([]);
    expect(computeTouchCoverage(layout, ["F"]).uncovered).toEqual(["F"]);
  });

  it("a multi-char RULE output credits each codepoint individually", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("T_FCFA", { text: "*FCFA*" })] }] },
    ]);
    const ruleIndex = buildTouchKeyRuleIndex(irWithRule("T_FCFA", "FCFA"));
    // The join's `produced` is the per-codepoint set, so each letter is covered…
    expect(computeTouchCoverage(layout, ["F", "C", "A"], { ruleIndex }).uncovered).toEqual([]);
    // …but the whole string is not, since nothing credits it as a unit here.
    expect(computeTouchCoverage(layout, ["FCFA"], { ruleIndex }).uncovered).toEqual(["FCFA"]);
  });
});
