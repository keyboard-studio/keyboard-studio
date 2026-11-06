/**
 * Tests for `applyLayoutOp` (spec 113 T021): context-free replacement,
 * exact-context rows, the effect record, and the refusals.
 */
import { describe, it, expect } from "vitest";
import type { LayoutOperation } from "@keyboard-studio/contracts";
import { emit, emitRule } from "../codec/emit.js";
import { applyLayoutOp } from "./applyLayoutOp.js";
import { entryRules, KMN, parseKmn, slotLines } from "./testKeyboard.js";

const meta = { seq: 1, at: 0 };

describe("applyLayoutOp: set-key", () => {
  it("removes every context-free rule for exactly vkey + layer and inserts one before the terminal rules", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" },
    });
    expect(slotLines(out, "K_A", [])).toEqual(["+ [K_A] > U+007A"]);
    const rules = entryRules(out);
    const idx = rules.findIndex((r) => r.nodeId === effect.inserted[0]);
    expect(rules[idx + 1]?.matchKind).toBe("match");
    expect(effect.removed.map((r) => emitRule(r.rule, true))).toEqual(["+ [K_A] > U+0061", "+ [K_A] > U+0078"]);
    expect(effect.removed.map((r) => r.index)).toEqual([0, 1]);
  });

  it("leaves other layers, other keys and contextual rules alone", () => {
    const ir = parseKmn();
    const { ir: out } = applyLayoutOp(ir, {
      ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" },
    });
    expect(slotLines(out, "K_A", ["SHIFT"])).toEqual(["+ [SHIFT K_A] > U+0041"]);
    expect(slotLines(out, "K_B", [])).toEqual(["+ [K_B] > U+0062"]);
    const text = emit(out);
    expect(text).toContain("dk(0001) + [K_A] >");
    expect(text).toContain("U+0071 + [K_B] > U+0051");
  });

  it("matches the layer as a modifier set, order-insensitive, and writes canonical order", () => {
    const ir = parseKmn(KMN.replace("+ [SHIFT K_A] > U+0041", "+ [RALT SHIFT K_A] > 'A'"));
    const { ir: out } = applyLayoutOp(ir, {
      ...meta, op: "set-key", vkey: "K_A", layer: ["SHIFT", "RALT"], output: { kind: "text", text: "Z" },
    });
    const lines = entryRules(out).map((r) => emitRule(r, true)).filter((l) => l.includes("K_A]"));
    expect(lines.filter((l) => l.includes("SHIFT RALT K_A"))).toHaveLength(1);
    expect(lines.some((l) => l.includes("RALT SHIFT K_A"))).toBe(false);
  });

  it("writes nul and deadkey outputs", () => {
    const ir = parseKmn();
    const nul = applyLayoutOp(ir, { ...meta, op: "set-key", vkey: "K_B", layer: [], output: { kind: "nul" } });
    expect(slotLines(nul.ir, "K_B", [])).toEqual(["+ [K_B] > nul"]);
    const dk = applyLayoutOp(ir, {
      ...meta, op: "set-key", vkey: "K_B", layer: [], output: { kind: "deadkey", deadkeyId: "0001" },
    });
    expect(slotLines(dk.ir, "K_B", [])).toEqual(["+ [K_B] > dk(0001)"]);
  });

  it("stamps inserted rules authorEdit layout-tab, with a fresh unique nodeId", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "set-key", vkey: "K_C", layer: [], output: { kind: "text", text: "c" },
    });
    const inserted = entryRules(out).filter((r) => effect.inserted.includes(r.nodeId));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.authorEdit).toBe("layout-tab");
    const all = entryRules(out).map((r) => r.nodeId);
    expect(new Set(all).size).toBe(all.length);
  });

  it("does not mutate the input IR", () => {
    const ir = parseKmn();
    const before = emit(ir);
    const snap = structuredClone(ir);
    applyLayoutOp(ir, { ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" } });
    expect(emit(ir)).toBe(before);
    expect(ir).toEqual(snap);
  });
});

describe("applyLayoutOp: rows", () => {
  it("set-row replaces exactly the rule with this context + key", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "set-row", vkey: "K_A", layer: [],
      context: [{ kind: "deadkey", deadkeyId: "0001" }],
      becomes: [{ kind: "text", text: "z" }],
    });
    const lines = entryRules(out).map((r) => emitRule(r, true));
    expect(lines).toContain("dk(0001) + [K_A] > U+007A");
    expect(lines.filter((l) => l.startsWith("dk(0001) + [K_A]"))).toHaveLength(1);
    expect(effect.removed).toHaveLength(1);
    expect(slotLines(out, "K_A", [])).toEqual(["+ [K_A] > U+0061", "+ [K_A] > U+0078"]);
  });

  it("set-row with a literal-text context inserts a new row and keeps the context-free rules", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "set-row", vkey: "K_A", layer: [],
      context: [{ kind: "text", text: "ab" }],
      becomes: [{ kind: "text", text: "z" }],
    });
    expect(effect.removed).toHaveLength(0);
    const lines = entryRules(out).map((r) => emitRule(r, true));
    expect(lines.some((l) => l.includes("+ [K_A] > U+007A") && l.startsWith("U+0061 U+0062 +"))).toBe(true);
    expect(slotLines(out, "K_A", [])).toHaveLength(2);
  });

  it("set-row replaces an existing literal-context row", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "set-row", vkey: "K_B", layer: [],
      context: [{ kind: "text", text: "q" }],
      becomes: { kind: "nul" },
    });
    expect(effect.removed).toHaveLength(1);
    const lines = entryRules(out).map((r) => emitRule(r, true));
    expect(lines.filter((l) => l.includes("[K_B]"))).toHaveLength(2);
    expect(lines.some((l) => l.includes("U+0071") && l.endsWith("> nul"))).toBe(true);
  });

  it("set-row with a different context does not touch the existing row", () => {
    const ir = parseKmn();
    const { effect } = applyLayoutOp(ir, {
      ...meta, op: "set-row", vkey: "K_B", layer: [],
      context: [{ kind: "text", text: "r" }],
      becomes: { kind: "nul" },
    });
    expect(effect.removed).toHaveLength(0);
  });

  it("remove-row removes exactly the rule with this context + key and inserts nothing", () => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, {
      ...meta, op: "remove-row", vkey: "K_B", layer: [], context: [{ kind: "text", text: "q" }],
    });
    expect(emit(out)).not.toContain("+ [K_B] > U+0051");
    expect(effect.inserted).toEqual([]);
    expect(effect.removed).toHaveLength(1);
    expect(slotLines(out, "K_B", [])).toEqual(["+ [K_B] > U+0062"]);
  });
});

describe("applyLayoutOp: no-effect ops", () => {
  it.each<LayoutOperation>([
    { ...meta, op: "decline-case-partner", vkey: "K_A", layer: [], partner: "A" },
    { ...meta, op: "clear-key", vkey: "K_A", layer: [] },
  ])("$op leaves the IR unchanged", (op) => {
    const ir = parseKmn();
    const { ir: out, effect } = applyLayoutOp(ir, op);
    expect(emit(out)).toBe(emit(ir));
    expect(effect.inserted).toEqual([]);
    expect(effect.removed).toEqual([]);
  });
});

describe("applyLayoutOp: refusals", () => {
  const setA: LayoutOperation = {
    ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" },
  };

  it("throws for a readonly entry group", () => {
    const ir = parseKmn();
    const g = ir.groups.find((x) => x.name === "main");
    if (g !== undefined) g.readonly = true;
    expect(() => applyLayoutOp(ir, setA)).toThrow(/read-only/);
  });

  it("throws when an opaque fragment is the rule on the slot", () => {
    const ir = parseKmn();
    const g = ir.groups.find((x) => x.name === "main");
    ir.raw.push({
      nodeId: "raw:1", origin: "imported", sourceText: "+ [K_A] > call(foo)", reason: "call/return",
      ...(g !== undefined ? { groupNodeId: g.nodeId } : {}),
    });
    expect(() => applyLayoutOp(ir, setA)).toThrow(/opaque/);
    expect(() => applyLayoutOp(ir, { ...setA, vkey: "K_B" })).not.toThrow();
  });

  it("throws for a mnemonic keyboard", () => {
    const ir = parseKmn(KMN.replace("store(&TARGETS) 'any'", "store(&TARGETS) 'any'\nstore(&MnemonicLayout) \"1\""));
    expect(() => applyLayoutOp(ir, setA)).toThrow(/mnemonic/);
  });

  it("throws for an unknown deadkey id, numeric or named, in output, context or becomes", () => {
    const ir = parseKmn();
    expect(() => applyLayoutOp(ir, { ...setA, output: { kind: "deadkey", deadkeyId: "0009" } })).toThrow(/unknown deadkey/);
    expect(() => applyLayoutOp(ir, { ...setA, output: { kind: "deadkey", deadkeyId: "acute" } })).toThrow(/unknown deadkey/);
    expect(() => applyLayoutOp(ir, {
      ...meta, op: "remove-row", vkey: "K_A", layer: [], context: [{ kind: "deadkey", deadkeyId: "0009" }],
    })).toThrow(/unknown deadkey/);
    expect(() => applyLayoutOp(ir, {
      ...meta, op: "set-row", vkey: "K_A", layer: [], context: [], becomes: [{ kind: "deadkey", deadkeyId: "0009" }],
    })).toThrow(/unknown deadkey/);
  });

  it("accepts a named deadkey already in the IR", () => {
    const ir = parseKmn(KMN.replaceAll("dk(0001)", "dk(acute)"));
    const { ir: out } = applyLayoutOp(ir, { ...setA, vkey: "K_B", output: { kind: "deadkey", deadkeyId: "acute" } });
    expect(slotLines(out, "K_B", [])).toEqual(["+ [K_B] > dk(acute)"]);
  });

  it("a refused edit leaves the input untouched", () => {
    const ir = parseKmn();
    const before = emit(ir);
    expect(() => applyLayoutOp(ir, { ...setA, output: { kind: "deadkey", deadkeyId: "0009" } })).toThrow();
    expect(emit(ir)).toBe(before);
  });
});
