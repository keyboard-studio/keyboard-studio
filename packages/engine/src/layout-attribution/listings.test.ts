import { describe, expect, it } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { findShadowedRules } from "./findShadowedRules.js";
import { isMnemonic } from "./isMnemonic.js";
import { listContexts } from "./listContexts.js";
import { listLayers } from "./listLayers.js";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(bases) 'ae'
store(outs) 'áé'
begin Unicode > use(main)
group(main) using keys
`;

function irOf(rules: string, head = HEAD): KeyboardIR {
  return parse(head + rules + "\n", "t").ir;
}

describe("listLayers", () => {
  it("lists the no-modifier layer first, then each combination in use once", () => {
    const ir = irOf("+ [K_A] > 'a'\n+ [SHIFT K_A] > 'A'\n+ [SHIFT K_B] > 'B'\n+ [RALT K_A] > 'x'\n+ [SHIFT RALT K_A] > 'y'");
    expect(listLayers(ir)).toEqual([[], ["SHIFT"], ["RALT"], ["SHIFT", "RALT"]]);
  });

  it("a keyboard with only unmodified rules has one layer", () => {
    expect(listLayers(irOf("+ [K_A] > 'a'"))).toEqual([[]]);
  });
});

describe("isMnemonic", () => {
  it("true only when &mnemoniclayout is 1", () => {
    expect(isMnemonic(irOf("+ [K_A] > 'a'"))).toBe(false);
    const on = HEAD.replace("begin Unicode", "store(&MNEMONICLAYOUT) '1'\nbegin Unicode");
    const off = HEAD.replace("begin Unicode", "store(&MNEMONICLAYOUT) '0'\nbegin Unicode");
    expect(isMnemonic(irOf("+ 'a' > 'x'", on))).toBe(true);
    expect(isMnemonic(irOf("+ 'a' > 'x'", off))).toBe(false);
  });
});

describe("listContexts", () => {
  it("lists literal contexts and deadkeys with key counts", () => {
    const ir = irOf(
      [
        "+ [K_A] > dk(0001)",
        "dk(0001) + [K_B] > 'q'",
        "dk(0001) + [K_C] > 'r'",
        "dk(0001) + [SHIFT K_C] > 'R'",
        "'n' + [K_C] > 'ñ'",
        "+ [K_D] > dk(acute)",
        "dk(0002) + any(bases) > index(outs, 2)",
      ].join("\n"),
    );
    const byId = new Map(listContexts(ir).map((c) => [JSON.stringify(c.context), c.keyCount] as const));
    expect(byId.get(JSON.stringify([{ kind: "deadkey", deadkeyId: "0001" }]))).toBe(3);
    expect(byId.get(JSON.stringify([{ kind: "text", text: "n" }]))).toBe(1);
    // produced by a key but without rows yet: still a context, with no keys
    expect(byId.get(JSON.stringify([{ kind: "deadkey", deadkeyId: "acute" }]))).toBe(0);
    // a fan-out table counts one key per base character
    expect(byId.get(JSON.stringify([{ kind: "deadkey", deadkeyId: "0002" }]))).toBe(2);
  });

  it("is empty for a keyboard with only context-free rules", () => {
    expect(listContexts(irOf("+ [K_A] > 'a'"))).toEqual([]);
  });
});

describe("findShadowedRules", () => {
  it("flags a later rule with the same context and key element", () => {
    const ir = irOf("+ [K_A] > 'x'\n+ [K_B] > 'b'\n+ [K_A] > 'y'\n'n' + [K_A] > 'ñ'\n'n' + [K_A] > 'm'");
    const rules = ir.groups[0]!.rules;
    expect(findShadowedRules(ir)).toEqual([
      { ruleNodeId: rules[2]!.nodeId, shadowedBy: rules[0]!.nodeId },
      { ruleNodeId: rules[4]!.nodeId, shadowedBy: rules[3]!.nodeId },
    ]);
  });

  it("does not flag the same key under another layer or another context", () => {
    const ir = irOf("+ [K_A] > 'x'\n+ [SHIFT K_A] > 'y'\n'n' + [K_A] > 'z'");
    expect(findShadowedRules(ir)).toEqual([]);
  });

  it("compares modifiers as a set and ignores the codec's plus separator", () => {
    const ir = irOf("+ [SHIFT RALT K_A] > 'x'\n+ [RALT SHIFT K_A] > 'y'");
    expect(findShadowedRules(ir)).toHaveLength(1);
  });

  it("does not look across groups", () => {
    const ir = irOf("+ [K_A] > 'x'\nmatch > use(g2)\ngroup(g2) using keys\n+ [K_A] > 'y'");
    expect(findShadowedRules(ir)).toEqual([]);
  });
});
