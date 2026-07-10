// Tests for modifierCombos.ts — the arbitrary modifier-combo vocabulary
// shared by the generalized S-08 "modifier_as_layer_switch" mechanism.

import { describe, it, expect } from "vitest";
import {
  MODIFIER_EXCLUSIONS,
  canonicalizeCombo,
  comboToKeySpec,
  parseKeySpec,
  comboToTouchLayerId,
  comboToKvksShiftToken,
  collectModifierTokensInUse,
  collectLayerCombosInUse,
  buildComboKeyMap,
  type ModifierToken,
} from "./modifierCombos.js";
import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _nodeSeq = 0;
function freshId(prefix: string): string {
  return `${prefix}:${++_nodeSeq}`;
}

function makeMinimalIR(groups: IRGroup[]): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function makeRule(vkey: string, modifiers: string[], output: string): IRRule {
  return {
    nodeId: freshId("rule"),
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

function makeGroup(rules: IRRule[], readonly = false): IRGroup {
  return { nodeId: freshId("group"), name: "main", usingKeys: true, rules, readonly };
}

// ---------------------------------------------------------------------------
// MODIFIER_EXCLUSIONS — symmetry
// ---------------------------------------------------------------------------

describe("MODIFIER_EXCLUSIONS", () => {
  const ALL_TOKENS = Object.keys(MODIFIER_EXCLUSIONS) as ModifierToken[];

  it("is self-inclusive for every token", () => {
    for (const token of ALL_TOKENS) {
      expect(MODIFIER_EXCLUSIONS[token]).toContain(token);
    }
  });

  it("is symmetric: if A excludes B, B excludes A", () => {
    for (const a of ALL_TOKENS) {
      for (const b of MODIFIER_EXCLUSIONS[a]) {
        expect(MODIFIER_EXCLUSIONS[b]).toContain(a);
      }
    }
  });

  it("matches the GATE-confirmed matrix exactly", () => {
    expect(new Set(MODIFIER_EXCLUSIONS.SHIFT)).toEqual(new Set(["SHIFT"]));
    expect(new Set(MODIFIER_EXCLUSIONS.CAPS)).toEqual(new Set(["CAPS", "NCAPS"]));
    expect(new Set(MODIFIER_EXCLUSIONS.NCAPS)).toEqual(new Set(["NCAPS", "CAPS"]));
    expect(new Set(MODIFIER_EXCLUSIONS.ALT)).toEqual(new Set(["ALT", "RALT", "LALT"]));
    expect(new Set(MODIFIER_EXCLUSIONS.RALT)).toEqual(new Set(["RALT", "LALT", "ALT"]));
    expect(new Set(MODIFIER_EXCLUSIONS.LALT)).toEqual(new Set(["LALT", "RALT", "ALT"]));
    expect(new Set(MODIFIER_EXCLUSIONS.CTRL)).toEqual(new Set(["CTRL", "RCTRL"]));
    expect(new Set(MODIFIER_EXCLUSIONS.RCTRL)).toEqual(new Set(["RCTRL", "CTRL"]));
  });

  it("does not include LCTRL as a token (excluded by product decision)", () => {
    expect(ALL_TOKENS).not.toContain("LCTRL");
  });
});

// ---------------------------------------------------------------------------
// canonicalizeCombo
// ---------------------------------------------------------------------------

describe("canonicalizeCombo", () => {
  it("dedupes repeated tokens", () => {
    expect(canonicalizeCombo(["SHIFT", "SHIFT", "RALT"])).toEqual(["SHIFT", "RALT"]);
  });

  it("orders canonically regardless of input order (SHIFT, ctrl-family, alt-family, caps-family)", () => {
    expect(canonicalizeCombo(["RALT", "SHIFT"])).toEqual(["SHIFT", "RALT"]);
    expect(canonicalizeCombo(["NCAPS", "CTRL", "SHIFT", "ALT"])).toEqual([
      "SHIFT",
      "CTRL",
      "ALT",
      "NCAPS",
    ]);
  });

  it("is stable across repeated calls with permuted input", () => {
    const a = canonicalizeCombo(["RCTRL", "SHIFT", "LALT"]);
    const b = canonicalizeCombo(["LALT", "RCTRL", "SHIFT"]);
    expect(a).toEqual(b);
  });

  it("throws for mutually-exclusive tokens", () => {
    expect(() => canonicalizeCombo(["ALT", "RALT"])).toThrow();
    expect(() => canonicalizeCombo(["CTRL", "RCTRL"])).toThrow();
    expect(() => canonicalizeCombo(["CAPS", "NCAPS"])).toThrow();
  });

  it("accepts up to 4 non-conflicting tokens (one per family)", () => {
    expect(canonicalizeCombo(["SHIFT", "CTRL", "ALT", "CAPS"])).toEqual([
      "SHIFT",
      "CTRL",
      "ALT",
      "CAPS",
    ]);
  });

  it("accepts an empty combo", () => {
    expect(canonicalizeCombo([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// comboToKeySpec / parseKeySpec — round-trip
// ---------------------------------------------------------------------------

describe("comboToKeySpec / parseKeySpec round-trip", () => {
  it("builds the expected bracket notation", () => {
    expect(comboToKeySpec(["RALT"], "K_X")).toBe("[RALT K_X]");
    expect(comboToKeySpec(["RALT", "SHIFT"], "K_X")).toBe("[SHIFT RALT K_X]");
    expect(comboToKeySpec([], "K_X")).toBe("[K_X]");
  });

  it("round-trips through parseKeySpec for a variety of combos", () => {
    const cases: Array<[ModifierToken[], string]> = [
      [[], "K_A"],
      [["SHIFT"], "K_B"],
      [["RALT"], "K_C"],
      [["SHIFT", "RALT"], "K_D"],
      [["CTRL", "ALT"], "K_E"],
      [["SHIFT", "RCTRL", "LALT", "CAPS"], "K_F"],
    ];
    for (const [tokens, vkey] of cases) {
      const spec = comboToKeySpec(tokens, vkey);
      const parsed = parseKeySpec(spec);
      expect(parsed).not.toBeNull();
      expect(parsed?.vkey).toBe(vkey);
      expect(parsed?.tokens).toEqual(canonicalizeCombo(tokens));
    }
  });

  it("parses a bare vkey bracket with no modifiers", () => {
    expect(parseKeySpec("[K_A]")).toEqual({ tokens: [], vkey: "K_A" });
  });

  it("parses a .kmn-style rule-line prefix, taking the first bracket group", () => {
    expect(parseKeySpec("+ [RALT K_A] > U+00E9")).toEqual({ tokens: ["RALT"], vkey: "K_A" });
  });

  it("returns null when there is no bracket group", () => {
    expect(parseKeySpec("no brackets here")).toBeNull();
  });

  it("drops unrecognized modifier words instead of rejecting", () => {
    expect(parseKeySpec("[LCTRL K_A]")).toEqual({ tokens: [], vkey: "K_A" });
  });
});

// ---------------------------------------------------------------------------
// comboToTouchLayerId
// ---------------------------------------------------------------------------

describe("comboToTouchLayerId", () => {
  it("matches the attested single-token table", () => {
    expect(comboToTouchLayerId([])).toBe("default");
    expect(comboToTouchLayerId(["SHIFT"])).toBe("shift");
    expect(comboToTouchLayerId(["RALT"])).toBe("rightalt");
    expect(comboToTouchLayerId(["ALT"])).toBe("alt");
    expect(comboToTouchLayerId(["LALT"])).toBe("alt");
    expect(comboToTouchLayerId(["CTRL"])).toBe("ctrl");
    expect(comboToTouchLayerId(["RCTRL"])).toBe("rightctrl");
  });

  it("matches the attested (inconsistent-ordering) 2-token combos verbatim", () => {
    expect(comboToTouchLayerId(["SHIFT", "RALT"])).toBe("rightalt-shift");
    expect(comboToTouchLayerId(["SHIFT", "CTRL"])).toBe("shift-ctrl");
    expect(comboToTouchLayerId(["SHIFT", "RCTRL"])).toBe("rightctrl-shift");
  });

  it("returns null for any combo containing CAPS or NCAPS", () => {
    expect(comboToTouchLayerId(["CAPS"])).toBeNull();
    expect(comboToTouchLayerId(["NCAPS"])).toBeNull();
    expect(comboToTouchLayerId(["SHIFT", "CAPS"])).toBeNull();
    expect(comboToTouchLayerId(["SHIFT", "RALT", "CTRL", "NCAPS"])).toBeNull();
  });

  it("falls back to a stable per-token concatenation for unattested combos", () => {
    const id = comboToTouchLayerId(["CTRL", "ALT"]);
    expect(id).toBe("ctrl-alt");
    // Same combo, permuted input order, must fall back to the same id.
    expect(comboToTouchLayerId(["ALT", "CTRL"])).toBe(id);
  });

  it("is stable for a full 3-token unattested stack", () => {
    const id = comboToTouchLayerId(["SHIFT", "CTRL", "RALT"]);
    expect(id).toBe("shift-ctrl-rightalt");
  });
});

// ---------------------------------------------------------------------------
// comboToKvksShiftToken
// ---------------------------------------------------------------------------

describe("comboToKvksShiftToken", () => {
  it("matches the pre-existing hard-coded RA/SRA convention exactly", () => {
    expect(comboToKvksShiftToken(["RALT"])).toBe("RA");
    expect(comboToKvksShiftToken(["SHIFT", "RALT"])).toBe("SRA");
  });

  it("produces the expected token for other single and multi-token combos", () => {
    expect(comboToKvksShiftToken([])).toBe("");
    expect(comboToKvksShiftToken(["SHIFT"])).toBe("S");
    expect(comboToKvksShiftToken(["CTRL"])).toBe("C");
    expect(comboToKvksShiftToken(["RCTRL"])).toBe("RC");
    expect(comboToKvksShiftToken(["ALT"])).toBe("A");
    expect(comboToKvksShiftToken(["LALT"])).toBe("LA");
    expect(comboToKvksShiftToken(["SHIFT", "CTRL", "ALT"])).toBe("SCA");
  });

  it("returns null for any combo containing CAPS or NCAPS", () => {
    expect(comboToKvksShiftToken(["CAPS"])).toBeNull();
    expect(comboToKvksShiftToken(["NCAPS"])).toBeNull();
    expect(comboToKvksShiftToken(["SHIFT", "RALT", "CAPS"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collectModifierTokensInUse / collectLayerCombosInUse
// ---------------------------------------------------------------------------

describe("collectModifierTokensInUse", () => {
  it("collects every distinct token used across non-readonly groups", () => {
    const ir = makeMinimalIR([
      makeGroup([
        makeRule("K_A", [], "a"),
        makeRule("K_A", ["SHIFT"], "A"),
        makeRule("K_B", ["RALT"], "b"),
        makeRule("K_C", ["SHIFT", "RALT"], "c"),
      ]),
    ]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set(["SHIFT", "RALT"]));
  });

  it("ignores readonly groups", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "a")], true)]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set());
  });

  it("normalizes the RIGHTALT alias to RALT", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["RIGHTALT"], "a")])]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set(["RALT"]));
  });

  it("drops unrecognized modifier words (e.g. LCTRL)", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["LCTRL"], "a")])]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set());
  });
});

describe("collectLayerCombosInUse", () => {
  it("collects distinct canonicalized combos, deduplicated", () => {
    const ir = makeMinimalIR([
      makeGroup([
        makeRule("K_A", [], "a"), // no-modifier rule is not a "combo"
        makeRule("K_A", ["SHIFT"], "A"),
        makeRule("K_B", ["RALT", "SHIFT"], "b"), // same combo, different key
        makeRule("K_C", ["RALT"], "c"),
      ]),
    ]);
    const combos = collectLayerCombosInUse(ir).map((c) => c.join("+"));
    expect(new Set(combos)).toEqual(new Set(["SHIFT", "SHIFT+RALT", "RALT"]));
    expect(combos.length).toBe(3); // deduplicated, not 3 rules producing 4 entries
  });

  it("ignores readonly groups", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "a")], true)]);
    expect(collectLayerCombosInUse(ir)).toEqual([]);
  });
});

describe("buildComboKeyMap", () => {
  it("builds a (vkey -> char) map for rules matching exactly the given combo", () => {
    const ir = makeMinimalIR([
      makeGroup([
        makeRule("K_A", ["CTRL", "ALT"], "x"),
        makeRule("K_B", ["CTRL", "ALT"], "y"),
        makeRule("K_C", ["CTRL"], "z"), // different combo — excluded
        makeRule("K_D", ["ALT"], "w"), // different combo — excluded
      ]),
    ]);
    const map = buildComboKeyMap(ir, canonicalizeCombo(["CTRL", "ALT"]));
    expect(Object.fromEntries(map)).toEqual({ K_A: "x", K_B: "y" });
  });

  it("first-wins per vkey when multiple rules target the same (vkey, combo)", () => {
    const ir = makeMinimalIR([
      makeGroup([makeRule("K_A", ["RALT"], "first"), makeRule("K_A", ["RALT"], "second")]),
    ]);
    const map = buildComboKeyMap(ir, ["RALT"]);
    expect(map.get("K_A")).toBe("first");
  });

  it("returns an empty map when no rule matches the combo", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["SHIFT"], "a")])]);
    expect(buildComboKeyMap(ir, ["RALT"]).size).toBe(0);
  });
});
