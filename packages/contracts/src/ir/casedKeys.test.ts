import { describe, it, expect } from "vitest";
import { caseCounterpart, casedKeySet, casedKeysStoreText, declaredCasedKeys, keyPlaneOutputs } from "./casedKeys.js";
import type { IRRule, IRStore, KeyboardIR } from "../keyboard-ir.js";

describe("caseCounterpart", () => {
  it("theta lowercase -> uppercase", () => {
    expect(caseCounterpart("θ")).toEqual({ counterpart: "Θ", direction: "toUpper" });
  });

  it("theta uppercase -> lowercase (bidirectional)", () => {
    expect(caseCounterpart("Θ")).toEqual({ counterpart: "θ", direction: "toLower" });
  });

  it("returns null for ß (multi-char SS expansion)", () => {
    expect(caseCounterpart("ß")).toBeNull();
  });

  it("returns null for ﬃ ligature (multi-char FFI expansion)", () => {
    expect(caseCounterpart("ﬃ")).toBeNull();
  });

  it("returns null for Arabic alef (caseless script)", () => {
    expect(caseCounterpart("ا")).toBeNull();
  });

  it("returns null for Devanagari ka (caseless script)", () => {
    expect(caseCounterpart("क")).toBeNull();
  });

  it("returns null for a standalone combining mark (U+0300)", () => {
    expect(caseCounterpart("̀")).toBeNull();
  });

  it("maps i -> İ under the tr locale tag (dotted capital I)", () => {
    expect(caseCounterpart("i", "tr")).toEqual({ counterpart: "İ", direction: "toUpper" });
  });

  it("maps i -> I with no locale tag", () => {
    expect(caseCounterpart("i")).toEqual({ counterpart: "I", direction: "toUpper" });
  });

  it("Cherokee uppercase -> lowercase pair works", () => {
    expect(caseCounterpart("Ꭰ")).toEqual({ counterpart: "ꭰ", direction: "toLower" });
  });

  it("Cherokee lowercase -> uppercase pair works", () => {
    expect(caseCounterpart("ꭰ")).toEqual({ counterpart: "Ꭰ", direction: "toUpper" });
  });

  it("returns null for an already-covered equal-case letter (U+0138 kra)", () => {
    expect(caseCounterpart("ĸ")).toBeNull();
  });

  it("returns null for a multi-code-point input", () => {
    expect(caseCounterpart("ab")).toBeNull();
  });

  it("falls back to the locale-insensitive mapping for a malformed bcp47 tag (no throw)", () => {
    expect(caseCounterpart("a", "not a tag!!")).toEqual({
      counterpart: "A",
      direction: "toUpper",
    });
  });
});

// ---------------------------------------------------------------------------
// Key-level derivation (spec 112): IR is hand-built because contracts cannot
// import the engine codec. The shapes mirror the engine caps fixtures.
// ---------------------------------------------------------------------------

let nid = 0;
function emptyIr(): KeyboardIR {
  return { stores: [], groups: [], comments: [], raw: [], recognizedPatterns: [] } as unknown as KeyboardIR;
}
function rule(mods: string[], vkey: string, out: string): IRRule {
  return {
    nodeId: `r${nid++}`,
    context: [{ kind: "vkey", name: vkey, modifiers: mods }],
    output: [{ kind: "char", value: out }],
  } as IRRule;
}
function irOf(rules: IRRule[], stores: IRStore[] = []): KeyboardIR {
  const ir = emptyIr();
  ir.stores = stores;
  ir.groups = [{ nodeId: "g", name: "main", usingKeys: true, rules, readonly: false }];
  return ir;
}
function store(name: string, items: IRStore["items"], isSystem = false): IRStore {
  return { nodeId: `s${nid++}`, name, items, isSystem };
}
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const FLOOR = LETTERS.map((l) => `K_${l}`);
function letterRules(skip: string[] = []): IRRule[] {
  return LETTERS.filter((l) => !skip.includes(l)).flatMap((l) => [
    rule([], `K_${l}`, l.toLowerCase()),
    rule(["SHIFT"], `K_${l}`, l),
  ]);
}

describe("keyPlaneOutputs", () => {
  it("reads direct rules per plane", () => {
    const ir = irOf([rule([], "K_A", "a"), rule(["SHIFT"], "K_A", "A"), rule(["RALT"], "K_A", "á"), rule(["SHIFT", "RALT"], "K_A", "Á")]);
    expect(keyPlaneOutputs(ir).get("K_A")).toEqual({ base: "a", shift: "A", ralt: "á", "shift-ralt": "Á" });
  });

  it("reads the any(store) > index(store, n) RAlt form", () => {
    const ir = irOf(
      [{ nodeId: "x", context: [{ kind: "any", storeRef: "k" }], output: [{ kind: "index", storeRef: "o", offset: 1 }] } as IRRule],
      [
        store("k", [{ kind: "vkey", name: "K_N" }, { kind: "raw", text: "[RALT K_N]" }, { kind: "raw", text: "[SHIFT RALT K_N]" }]),
        store("o", [{ kind: "char", value: "n" }, { kind: "char", value: "ŋ" }, { kind: "char", value: "Ŋ" }]),
      ],
    );
    expect(keyPlaneOutputs(ir).get("K_N")).toEqual({ base: "n", ralt: "ŋ", "shift-ralt": "Ŋ" });
  });

  it("skips rules with deadkey context", () => {
    const ir = irOf([
      { nodeId: "d", context: [{ kind: "deadkey", id: 1 }, { kind: "vkey", name: "K_E", modifiers: [] }], output: [{ kind: "char", value: "é" }] } as IRRule,
    ]);
    expect(keyPlaneOutputs(ir).size).toBe(0);
  });

  it("folds CAPS/NCAPS siblings to the NCAPS output", () => {
    const ir = irOf([
      rule(["NCAPS"], "K_Q", "q"),
      rule(["CAPS"], "K_Q", "Q"),
      rule(["NCAPS", "SHIFT"], "K_Q", "Q"),
      rule(["CAPS", "SHIFT"], "K_Q", "q"),
    ]);
    expect(keyPlaneOutputs(ir).get("K_Q")).toEqual({ base: "q", shift: "Q" });
  });
});

describe("declaredCasedKeys", () => {
  it("is undefined when not declared", () => {
    expect(declaredCasedKeys(irOf([]))).toBeUndefined();
  });

  it("expands ranges", () => {
    const ir = irOf([], [store("&CasedKeys", [{ kind: "vkey", name: "K_A" }, { kind: "raw", text: ".." }, { kind: "vkey", name: "K_C" }, { kind: "vkey", name: "K_LBRKT" }], true)]);
    expect([...(declaredCasedKeys(ir) ?? [])].sort()).toEqual(["K_A", "K_B", "K_C", "K_LBRKT"]);
  });
});

describe("casedKeySet", () => {
  it("eng_ralt: floor plus K_LBRKT and K_N", () => {
    const ir = irOf([
      ...letterRules(["N"]),
      rule([], "K_LBRKT", "ŋ"),
      rule(["SHIFT"], "K_LBRKT", "Ŋ"),
      rule(["RALT"], "K_N", "ŋ"),
      rule(["SHIFT", "RALT"], "K_N", "Ŋ"),
    ]);
    const floor = FLOOR.filter((k) => k !== "K_N");
    const set = casedKeySet(ir, { floor });
    expect(set.extra).toEqual(["K_N", "K_LBRKT"]);
    expect(set.keys).toEqual([...floor, "K_N", "K_LBRKT"]);
    expect(set.conflicts).toEqual([]);
  });

  it("conflict: K_E is excluded even though it is in the floor, and reported", () => {
    const ir = irOf([
      ...letterRules(["E"]),
      rule([], "K_E", "ŋ"),
      rule(["SHIFT"], "K_E", "Ŋ"),
      rule(["RALT"], "K_E", "€"),
      rule(["SHIFT", "RALT"], "K_E", "£"),
    ]);
    const set = casedKeySet(ir, { floor: FLOOR });
    expect(set.keys).not.toContain("K_E");
    expect(set.keys).toHaveLength(25);
    expect(set.conflicts).toEqual([{ vkey: "K_E", plane: "ralt", unshifted: "€", shifted: "£" }]);
  });

  it("turkish: i/İ pair only with bcp47 tr", () => {
    const ir = irOf([rule([], "K_I", "i"), rule(["SHIFT"], "K_I", "İ")]);
    expect(casedKeySet(ir, { bcp47: "tr", floor: [] }).keys).toEqual(["K_I"]);
    expect(casedKeySet(ir, { floor: [] }).keys).toEqual([]);
  });

  it("AZERTY: Caps typing the Shift output qualifies a key with no case pair", () => {
    // basic_kbdfr's number row: & / 1, and Caps types 1.
    const ir = irOf([
      rule(["NCAPS"], "K_1", "&"),
      rule(["NCAPS", "SHIFT"], "K_1", "1"),
      rule(["CAPS"], "K_1", "1"),
      rule(["CAPS", "SHIFT"], "K_1", "&"),
    ]);
    expect(casedKeySet(ir, { floor: [] })).toEqual({ keys: ["K_1"], extra: ["K_1"], conflicts: [] });
  });

  it("Caps that types neither the Shift output nor the case counterpart is a conflict", () => {
    const ir = irOf([
      rule(["NCAPS"], "K_A", "a"),
      rule(["NCAPS", "SHIFT"], "K_A", "A"),
      rule(["CAPS"], "K_A", "ä"),
    ]);
    expect(casedKeySet(ir, { floor: [] }).keys).toEqual([]);
    // In the floor it is still left out, and reported.
    expect(casedKeySet(ir, { floor: ["K_A"] }).conflicts).toEqual([{ vkey: "K_A", plane: "base", unshifted: "a", shifted: "A" }]);
  });

  it("Caps ignored on one plane keeps the key out, since the store would change that plane", () => {
    const ir = irOf([
      rule(["NCAPS"], "K_E", "e"),
      rule(["NCAPS", "SHIFT"], "K_E", "E"),
      rule(["CAPS"], "K_E", "E"),
      rule(["NCAPS", "RALT"], "K_E", "€"),
      rule(["NCAPS", "SHIFT", "RALT"], "K_E", "£"),
      rule(["CAPS", "RALT"], "K_E", "€"),
    ]);
    const set = casedKeySet(ir, { floor: [] });
    expect(set.keys).toEqual([]);
    expect(set.conflicts.map((c) => c.plane)).toEqual(["ralt"]);
  });

  it("caseless: empty", () => {
    const ir = irOf([rule([], "K_1", "1"), rule(["SHIFT"], "K_1", "!"), rule([], "K_COMMA", ","), rule(["SHIFT"], "K_COMMA", ";")]);
    expect(casedKeySet(ir, { floor: [] })).toEqual({ keys: [], extra: [], conflicts: [] });
  });
});

describe("casedKeysStoreText", () => {
  it("writes the A-Z range when the floor is complete, then extras in key-code order", () => {
    expect(casedKeysStoreText([...FLOOR, "K_LBRKT", "K_1"])).toBe("[K_A]..[K_Z] [K_1] [K_LBRKT]");
  });

  it("lists keys individually when the floor is incomplete", () => {
    expect(casedKeysStoreText(["K_B", "K_A"])).toBe("[K_A] [K_B]");
  });
});
