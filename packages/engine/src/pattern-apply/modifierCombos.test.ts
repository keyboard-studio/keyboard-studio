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
import { validateWithOracle } from "../validator/oracle.js";

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
    expect(new Set(MODIFIER_EXCLUSIONS.CTRL)).toEqual(new Set(["CTRL", "RCTRL", "LCTRL"]));
    expect(new Set(MODIFIER_EXCLUSIONS.RCTRL)).toEqual(new Set(["RCTRL", "CTRL", "LCTRL"]));
    expect(new Set(MODIFIER_EXCLUSIONS.LCTRL)).toEqual(new Set(["LCTRL", "CTRL", "RCTRL"]));
  });

  it("includes LCTRL as a first-class chooseable token (mechanism-gallery product decision)", () => {
    expect(ALL_TOKENS).toContain("LCTRL");
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
    // No ctrl+alt pairing here, so the AltGr fold doesn't apply — this
    // combo is purely exercising ordering (see the dedicated fold/NCAPS
    // describe blocks below for those behaviors).
    expect(canonicalizeCombo(["CAPS", "RCTRL", "SHIFT"])).toEqual([
      "SHIFT",
      "RCTRL",
      "CAPS",
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

  it("accepts up to 3 non-conflicting tokens without triggering chirality unification (one ctrl-OR-alt-family token, not both)", () => {
    // Chirality unification only triggers when a GENERIC ctrl/alt token
    // (CTRL/ALT) coexists with a CHIRAL one (see below) — a combo with only
    // a chiral ctrl-family token and no alt-family token at all never
    // triggers it, so 3 is the practical max for an untouched combo here.
    expect(canonicalizeCombo(["SHIFT", "RCTRL", "CAPS"])).toEqual([
      "SHIFT",
      "RCTRL",
      "CAPS",
    ]);
  });

  it("accepts an empty combo", () => {
    expect(canonicalizeCombo([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// canonicalizeCombo — chirality unification (generic+chiral mix -> generic)
// ---------------------------------------------------------------------------
//
// A combo mixing a GENERIC ctrl/alt token (CTRL/ALT) with a CHIRAL one
// (RCTRL/RALT/LALT) is kmcmplib-invalid (KM_WARNING_KMCMP_4202659: "contains
// Ctrl,Alt and LCtrl,LAlt,RCtrl,RAlt sets of modifiers. Use only one or the
// other set for web target") and can never be delivered by a real keypress
// either — so every chiral ctrl/alt token in the mix is demoted to its
// generic form. The all-generic result (e.g. [CTRL ALT]) matches BOTH a
// genuine physical Ctrl+Alt press and a Windows AltGr ghost via Keyman
// core's IsEquivalentShift. A combo with ONLY chiral tokens (no generic
// CTRL/ALT present) is left untouched.
// ---------------------------------------------------------------------------

describe("canonicalizeCombo — chirality unification (generic+chiral mix -> generic)", () => {
  it("demotes RALT to ALT when a generic CTRL is also present", () => {
    expect(canonicalizeCombo(["CTRL", "RALT"])).toEqual(["CTRL", "ALT"]);
  });

  it("demotes RCTRL to CTRL when a generic ALT is also present", () => {
    expect(canonicalizeCombo(["RCTRL", "ALT"])).toEqual(["CTRL", "ALT"]);
  });

  it("unifies chirality while preserving SHIFT", () => {
    expect(canonicalizeCombo(["SHIFT", "CTRL", "RALT"])).toEqual(["SHIFT", "CTRL", "ALT"]);
  });

  it("leaves a pure-chiral combo untouched (no generic CTRL/ALT present)", () => {
    expect(canonicalizeCombo(["RALT"])).toEqual(["RALT"]);
    expect(canonicalizeCombo(["SHIFT", "RALT"])).toEqual(["SHIFT", "RALT"]);
  });

  it("leaves an already-all-generic combo untouched (no chiral token present)", () => {
    expect(canonicalizeCombo(["CTRL", "ALT"])).toEqual(["CTRL", "ALT"]);
  });

  it("does not unify ctrl-alone or alt-alone combos (no mix present)", () => {
    expect(canonicalizeCombo(["CTRL"])).toEqual(["CTRL"]);
    expect(canonicalizeCombo(["RCTRL"])).toEqual(["RCTRL"]);
    expect(canonicalizeCombo(["ALT"])).toEqual(["ALT"]);
    expect(canonicalizeCombo(["RALT"])).toEqual(["RALT"]);
    expect(canonicalizeCombo(["LALT"])).toEqual(["LALT"]);
  });
});

// ---------------------------------------------------------------------------
// canonicalizeCombo — NCAPS collapse
// ---------------------------------------------------------------------------
//
// NCAPS is not a first-class layer: a rule with no caps token already
// matches caps-off, so `[X]` and `[X NCAPS]` are functionally identical.
// ---------------------------------------------------------------------------

describe("canonicalizeCombo — NCAPS collapse", () => {
  it("strips a bare NCAPS token to the empty (base) combo", () => {
    expect(canonicalizeCombo(["NCAPS"])).toEqual([]);
  });

  it("collapses [RALT, NCAPS] to [RALT]", () => {
    expect(canonicalizeCombo(["RALT", "NCAPS"])).toEqual(["RALT"]);
  });

  it("leaves CAPS alone — it is a genuine distinct layer", () => {
    expect(canonicalizeCombo(["CAPS"])).toEqual(["CAPS"]);
    expect(canonicalizeCombo(["RALT", "CAPS"])).toEqual(["RALT", "CAPS"]);
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
    expect(parseKeySpec("[XYZZY K_A]")).toEqual({ tokens: [], vkey: "K_A" });
  });

  it("recognizes LCTRL as a first-class token now that it is a chooseable ModifierToken", () => {
    expect(parseKeySpec("[LCTRL K_A]")).toEqual({ tokens: ["LCTRL"], vkey: "K_A" });
  });

  it("leaves a raw all-chiral LCTRL+RALT pairing alone (no generic CTRL/ALT present, so no unification applies)", () => {
    expect(parseKeySpec("[LCTRL RALT K_A]")).toEqual({ tokens: ["LCTRL", "RALT"], vkey: "K_A" });
  });

  it("unifies a raw LCTRL + generic ALT pairing to generic CTRL+ALT instead of dropping LCTRL and losing the chiral-ctrl intent", () => {
    // Without unification this would silently become bare ALT (LCTRL
    // dropped, ALT kept) — a real behavior change from what the rule's
    // author meant.
    expect(parseKeySpec("[LCTRL ALT K_A]")).toEqual({ tokens: ["CTRL", "ALT"], vkey: "K_A" });
  });

  it("unifies a raw generic CTRL + chiral RALT pairing to generic CTRL+ALT", () => {
    expect(parseKeySpec("[CTRL RALT K_A]")).toEqual({ tokens: ["CTRL", "ALT"], vkey: "K_A" });
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
    expect(comboToTouchLayerId(["LCTRL"])).toBe("leftctrl");
  });

  it("matches the attested (inconsistent-ordering) 2-token combos verbatim", () => {
    expect(comboToTouchLayerId(["SHIFT", "RALT"])).toBe("rightalt-shift");
    expect(comboToTouchLayerId(["SHIFT", "CTRL"])).toBe("shift-ctrl");
    expect(comboToTouchLayerId(["SHIFT", "RCTRL"])).toBe("rightctrl-shift");
  });

  it("produces a real touch layer id for a CAPS-bearing combo — CAPS is a genuine navigable touch layer, not desktop-only", () => {
    // Corpus fact (applyTouchAssignmentsToRawJson.test.ts's sil_cameroon_qwerty
    // fixture): shipped .keyman-touch-layout files carry "caps" and
    // "rightalt-caps" as real layer ids.
    expect(comboToTouchLayerId(["CAPS"])).toBe("caps");
    expect(comboToTouchLayerId(["RALT", "CAPS"])).toBe("rightalt-caps");
    // SHIFT+CAPS is unattested in the sil_cameroon_qwerty fixture, but CAPS
    // is appended last per TOUCH_LAYER_PRECEDENCE_ORDER, same as the
    // attested rightalt-caps case.
    expect(comboToTouchLayerId(["SHIFT", "CAPS"])).toBe("shift-caps");
  });

  it("collapses a bare NCAPS combo to the base/default layer (NCAPS is stripped, not a distinct layer)", () => {
    expect(comboToTouchLayerId(["NCAPS"])).toBe("default");
    expect(comboToTouchLayerId(["RALT", "NCAPS"])).toBe("rightalt");
  });

  it("unifies a Ctrl+RAlt+NCAPS pick down to the generic shift-ctrl-alt id (chirality unification + NCAPS strip combined)", () => {
    expect(comboToTouchLayerId(["SHIFT", "RALT", "CTRL", "NCAPS"])).toBe("shift-ctrl-alt");
  });

  it("falls back to a stable per-token concatenation ordered per the live KMW engine's getLayerId bit-precedence (defaultLayouts.ts), not CANONICAL_ORDER", () => {
    // SHIFT+ALT is unattested — SHIFT sorts before the generic ALT flag in
    // KMW's own precedence order.
    const id = comboToTouchLayerId(["SHIFT", "ALT"]);
    expect(id).toBe("shift-alt");
    // Same combo, permuted input order, must fall back to the same id.
    expect(comboToTouchLayerId(["ALT", "SHIFT"])).toBe(id);

    // SHIFT+LALT is ALSO unattested, but LALTFLAG's bit sorts BEFORE
    // K_SHIFTFLAG in getLayerId — the opposite order from SHIFT+ALT above.
    // This is exactly the case the old CANONICAL_ORDER-based fallback got
    // backwards (it always sorted SHIFT first).
    expect(comboToTouchLayerId(["SHIFT", "LALT"])).toBe("alt-shift");
  });

  it("unifies a 3-token stack (SHIFT+CTRL+RALT) to the generic shift-ctrl-alt id, distinct from SHIFT+RALT alone", () => {
    // CTRL (generic) + RALT (chiral) triggers unification (RALT -> ALT), so
    // this is NOT the same id as the untouched pure-chiral SHIFT+RALT combo.
    expect(comboToTouchLayerId(["SHIFT", "CTRL", "RALT"])).toBe("shift-ctrl-alt");
    expect(comboToTouchLayerId(["SHIFT", "RALT"])).toBe("rightalt-shift");
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
    // SHIFT+RCTRL (no generic ALT/CTRL alongside it) does not trigger unification.
    expect(comboToKvksShiftToken(["SHIFT", "RCTRL"])).toBe("SRC");
  });

  it("leaves an all-generic Ctrl+Alt+Shift pick as its own SCA token (no chiral token present to unify)", () => {
    expect(comboToKvksShiftToken(["CTRL", "ALT", "SHIFT"])).toBe("SCA");
  });

  it("returns null only for a combo containing CAPS", () => {
    expect(comboToKvksShiftToken(["CAPS"])).toBeNull();
    expect(comboToKvksShiftToken(["SHIFT", "RALT", "CAPS"])).toBeNull();
  });

  it("collapses a bare/combined NCAPS combo to its non-NCAPS token", () => {
    expect(comboToKvksShiftToken(["NCAPS"])).toBe("");
    expect(comboToKvksShiftToken(["RALT", "NCAPS"])).toBe("RA");
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

  it("drops genuinely unrecognized modifier words", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["XYZZY"], "a")])]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set());
  });

  it("recognizes LCTRL as a first-class token now that it is a chooseable ModifierToken", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["LCTRL"], "a")])]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set(["LCTRL"]));
  });

  it("unifies a raw LCTRL + generic ALT rule to CTRL+ALT instead of dropping LCTRL and reporting bare ALT in use", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["LCTRL", "ALT"], "a")])]);
    expect(collectModifierTokensInUse(ir)).toEqual(new Set(["CTRL", "ALT"]));
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

// ---------------------------------------------------------------------------
// kmcmplib oracle — chirality unification actually clears the mixed-modifier
// warning (KM_WARNING_KMCMP_4202659), not just satisfies unit assertions.
// ---------------------------------------------------------------------------

function minimalKmnWithRule(ruleLine: string): string {
  return [
    "store(&NAME) 'ChiralityCheck'",
    "store(&VERSION) '14.0'",
    "store(&KEYBOARDVERSION) '1.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    `+ ${ruleLine} > 'x'`,
    "",
  ].join("\n");
}

describe("kmcmplib oracle — mixed generic+chiral modifier warning", () => {
  it("a literal mixed generic+chiral rule ([CTRL RALT K_A], bypassing canonicalizeCombo) triggers kmcmplib's mixed-modifier warning", async () => {
    const source = minimalKmnWithRule("[CTRL RALT K_A]");
    const findings = await validateWithOracle(source);
    const codes = findings.map((f) => f.code);
    expect(codes.some((c) => c.includes("4202659"))).toBe(true);
  }, 15000);

  it("the chirality-unified rule ([CTRL ALT K_A], as canonicalizeCombo actually emits) compiles with no mixed-modifier warning", async () => {
    const spec = comboToKeySpec(canonicalizeCombo(["CTRL", "RALT"]), "K_A");
    expect(spec).toBe("[CTRL ALT K_A]");

    const source = minimalKmnWithRule(spec);
    const findings = await validateWithOracle(source);
    const codes = findings.map((f) => f.code);
    expect(codes.some((c) => c.includes("4202659"))).toBe(false);
  }, 15000);
});
