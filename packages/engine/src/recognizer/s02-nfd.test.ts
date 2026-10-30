// S-02 NFD (base-plus-mark) deadkey: self-indexing store + trailing combining
// marks lifts to deadkey_single_tap_nfd; the parallel-store shape is unchanged.
import { describe, it, expect } from "vitest";
import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { recognizePatterns } from "./index.js";
import { s02Recognizer } from "./rules/s02-deadkey-single-tap.js";
import { rule as generated } from "./rules/generated/deadkey-single-tap.js";

const PLUS: IRRule["context"][number] = { kind: "raw", text: "+" };
const baseId = (id: string): string => id.split("#")[0]!;

function nfdRules(): IRRule[] {
  return [
    {
      nodeId: "rule#nfd-trig",
      context: [PLUS, { kind: "vkey", name: "K_QUOTE", modifiers: [] }],
      output: [{ kind: "deadkey", id: 1 }],
    },
    {
      nodeId: "rule#nfd-body",
      context: [{ kind: "deadkey", id: 1 }, PLUS, { kind: "any", storeRef: "dk_caron_bases" }],
      output: [
        { kind: "index", storeRef: "dk_caron_bases", offset: 2 },
        { kind: "char", value: "̌" },
      ],
    },
    {
      nodeId: "rule#nfd-esc",
      context: [{ kind: "deadkey", id: 1 }, PLUS, { kind: "vkey", name: "K_QUOTE", modifiers: [] }],
      output: [{ kind: "char", value: "̌" }],
    },
  ];
}

function nfdIR(): KeyboardIR {
  const g: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules: nfdRules() };
  return makeTestIR([g], [makeCharStore("store#nfd", "dk_caron_bases", "aAeE")]);
}

function mixedIR(): KeyboardIR {
  const classic: IRRule[] = [
    {
      nodeId: "rule#cl-trig",
      context: [PLUS, { kind: "vkey", name: "K_BKQUOTE", modifiers: [] }],
      output: [{ kind: "deadkey", id: 2 }],
    },
    {
      nodeId: "rule#cl-body",
      context: [{ kind: "deadkey", id: 2 }, PLUS, { kind: "any", storeRef: "gr_from" }],
      output: [{ kind: "index", storeRef: "gr_to", offset: 2 }],
    },
  ];
  const g: IRGroup = {
    nodeId: "group#main", name: "main", usingKeys: true, readonly: false,
    rules: [...nfdRules(), ...classic],
  };
  return makeTestIR([g], [
    makeCharStore("store#nfd", "dk_caron_bases", "aAeE"),
    makeCharStore("store#grf", "gr_from", "ae"),
    makeCharStore("store#grt", "gr_to", "àè"),
  ]);
}

describe("S-02 NFD deadkey recognition", () => {
  it("both matchers lift the NFD shape to deadkey_single_tap_nfd with markChars", () => {
    const ir = nfdIR();
    for (const rule of [s02Recognizer, generated]) {
      const ms = rule.match(ir);
      expect(ms).toHaveLength(1);
      const m = ms[0]!;
      expect(baseId(m.patternId)).toBe("deadkey_single_tap_nfd");
      expect(m.slotValues["baseLetters"]).toBe("aAeE");
      expect(m.slotValues["markChars"]).toBe("̌");
      expect(m.slotValues["accentedForms"]).toBeUndefined();
      expect(m.slotValues["accentChar"]).toBe("̌");
      expect(m.ownedNodes.map((n) => n.nodeId)).toContain("store#nfd");
      const p = rule.lift(m);
      expect(p.kmnFragment).toContain("index({{baseLetters}}, 2) {{markChars}}");
      expect(p.questions.map((q) => q.id)).toContain("markChars");
      expect(p.questions.map((q) => q.id)).not.toContain("accentedForms");
    }
  });

  it("full pipeline claims the NFD rules", () => {
    const res = recognizePatterns(nfdIR());
    expect(res.recognizedRatio).toBe(1);
    expect(res.ir.recognizedPatterns.map((p) => baseId(p.id))).toEqual(["deadkey_single_tap_nfd"]);
  });

  it("stacked marks are carried in order", () => {
    const ir = nfdIR();
    ir.groups[0]!.rules[1]!.output.push({ kind: "char", value: "̱" });
    const m = s02Recognizer.match(ir)[0]!;
    expect(m.slotValues["markChars"]).toBe("̱̌");
  });

  it("a mixed keyboard still recognises the parallel-store deadkey as deadkey_single_tap", () => {
    const ids = recognizePatterns(mixedIR()).ir.recognizedPatterns.map((p) => baseId(p.id)).sort();
    expect(ids).toEqual(["deadkey_single_tap", "deadkey_single_tap_nfd"]);
  });

  it("an index() followed by a non-char element, or a cross-store index, is not NFD", () => {
    const ir = nfdIR();
    ir.groups[0]!.rules[1]!.output[1] = { kind: "beep" };
    expect(s02Recognizer.match(ir)).toHaveLength(0);
    const ir2 = nfdIR();
    ir2.stores.push(makeCharStore("store#o", "other", "xxxx"));
    (ir2.groups[0]!.rules[1]!.output[0] as { storeRef: string }).storeRef = "other";
    expect(s02Recognizer.match(ir2)).toHaveLength(0);
  });
});
