import { describe, expect, it } from "vitest";
import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { classifyRule } from "./classifyRule.js";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(bases) 'ae'
store(outs) 'áé'
store(mixed) 'a' [K_B]
begin Unicode > use(main)
group(main) using keys
`;

function irOf(rules: string, head = HEAD): KeyboardIR {
  return parse(head + rules + "\n", "t").ir;
}

function first(ir: KeyboardIR): { group: IRGroup; rule: IRRule } {
  const group = ir.groups[0]!;
  return { group, rule: group.rules[0]! };
}

function cls(rules: string, head?: string) {
  const ir = irOf(rules, head);
  const { group, rule } = first(ir);
  return classifyRule(ir, group, rule);
}

describe("classifyRule shapes", () => {
  it("context-free: + [K_A] > 'x' is editable text on K_A, no layer", () => {
    const c = cls("+ [K_A] > 'x'");
    expect(c).toMatchObject({
      shape: "context-free",
      editable: true,
      contextFree: true,
      alwaysMatches: true,
      provenance: "starting-point",
      output: { kind: "text", text: "x" },
      context: [],
    });
    expect(c.keys).toEqual([{ vkey: "K_A", layer: [] }]);
  });

  it("context-free nul and deadkey outputs are editable", () => {
    expect(cls("+ [K_A] > nul").output).toEqual({ kind: "nul" });
    expect(cls("+ [K_A] > dk(0001)").output).toEqual({ kind: "deadkey", deadkeyId: "0001" });
    expect(cls("+ [K_A] > dk(acute)").output).toEqual({ kind: "deadkey", deadkeyId: "acute" });
  });

  it("context-free with mixed text and deadkey output is complex-output", () => {
    const c = cls("+ [K_A] > 'x' dk(0001)");
    expect(c).toMatchObject({ shape: "context-free", editable: false, readOnlyReason: "complex-output", output: null });
  });

  it("deadkey-keystroke: dk(x) + [SHIFT K_B] > 'q'", () => {
    const c = cls("dk(0001) + [SHIFT K_B] > 'q'");
    expect(c).toMatchObject({
      shape: "deadkey-keystroke",
      editable: true,
      contextFree: false,
      context: [{ kind: "deadkey", deadkeyId: "0001" }],
      output: [{ kind: "text", text: "q" }],
    });
    expect(c.keys).toEqual([{ vkey: "K_B", layer: ["SHIFT"] }]);
  });

  it("literal-context: 'n' + [K_C] > 'ñ'", () => {
    const c = cls("'n' + [K_C] > 'ñ'");
    expect(c).toMatchObject({
      shape: "literal-context",
      editable: true,
      context: [{ kind: "text", text: "n" }],
      output: [{ kind: "text", text: "ñ" }],
    });
  });

  it("literal-context with text and a deadkey in the context, and a deadkey in the output", () => {
    const c = cls("'e' dk(acute) + [K_C] > 'x' dk(0002)");
    expect(c.shape).toBe("literal-context");
    expect(c.editable).toBe(true);
    expect(c.context).toEqual([
      { kind: "text", text: "e" },
      { kind: "deadkey", deadkeyId: "acute" },
    ]);
    expect(c.output).toEqual([
      { kind: "text", text: "x" },
      { kind: "deadkey", deadkeyId: "0002" },
    ]);
  });

  it("literal-context with nul output", () => {
    expect(cls("'n' + [K_C] > nul").output).toEqual({ kind: "nul" });
  });

  it("store-based: + any(bases) > index(outs, 1) is read-only and covers the keys that type the store", () => {
    const c = cls("+ any(bases) > index(outs, 1)");
    expect(c).toMatchObject({ shape: "store-based", editable: false, readOnlyReason: "store-based" });
    expect(c.keys.map((k) => k.vkey).sort()).toEqual(["K_A", "K_E"]);
  });

  it("store-based: any() in the pre-context of a keystroke rule", () => {
    const c = cls("any(bases) + [K_C] > 'z'");
    expect(c).toMatchObject({ shape: "store-based", editable: false, readOnlyReason: "store-based" });
  });
});

describe("deadkey fan-out exemption (research R3)", () => {
  it("dk(x) + any(plain bases) > index(plain outs, 2) is deadkey-fanout and editable", () => {
    const c = cls("dk(0001) + any(bases) > index(outs, 2)");
    expect(c.shape).toBe("deadkey-fanout");
    expect(c.editable).toBe(true);
    expect(c.keys).toEqual([]);
    expect(c.context).toEqual([{ kind: "deadkey", deadkeyId: "0001" }]);
    expect(c.fanout).toEqual({
      deadkeyId: "0001",
      baseStore: "bases",
      outStore: "outs",
      pairs: [
        { base: "a", result: "á" },
        { base: "e", result: "é" },
      ],
    });
  });

  it("named deadkeys qualify", () => {
    const c = cls("dk(acute) + any(bases) > index(outs, 2)");
    expect(c.shape).toBe("deadkey-fanout");
    expect(c.fanout?.deadkeyId).toBe("acute");
  });

  it("a non-plain store makes it store-based", () => {
    const c = cls("dk(0001) + any(mixed) > index(outs, 2)");
    expect(c).toMatchObject({ shape: "store-based", editable: false, readOnlyReason: "store-based" });
  });

  it("stores of unequal length, a wrong index offset, or extra output are store-based", () => {
    const head = HEAD.replace("begin Unicode", "store(short) 'á'\nbegin Unicode");
    const lines = [
      "dk(0001) + any(bases) > index(short, 2)",
      "dk(0001) + any(bases) > index(outs, 1)",
      "dk(0001) + any(bases) > index(outs, 2) 'x'",
    ];
    for (const l of lines) {
      const c = cls(l, head);
      expect(c.shape, l).toBe("store-based");
      expect(c.editable, l).toBe(false);
    }
  });
});

describe("classifyRule read-only classes", () => {
  it("platform() and option guards are conditional", () => {
    const head = HEAD.replace("begin Unicode", "store(opt) '0'\nbegin Unicode");
    for (const l of ["platform('touch') + [K_A] > 'x'", "if(opt = '1') + [K_A] > 'x'"]) {
      const c = cls(l, head);
      expect(c, l).toMatchObject({ shape: "conditional", editable: false, readOnlyReason: "conditional", alwaysMatches: false });
    }
  });

  it("an opaque fragment is opaque and read-only, and still names its key", () => {
    const ir = irOf("+ [SHIFT K_A] > 'x'");
    const { group } = first(ir);
    const c = classifyRule(ir, group, {
      nodeId: "raw#0",
      origin: "imported",
      sourceText: "+ [SHIFT K_A] > call(foo)",
      reason: "call-return",
    });
    expect(c).toMatchObject({ shape: "opaque", editable: false, readOnlyReason: "opaque", contextFree: true });
    expect(c.keys).toEqual([{ vkey: "K_A", layer: ["SHIFT"] }]);
  });

  it("a rule in a readonly group is read-only", () => {
    const ir = irOf("+ [K_A] > 'x'");
    const group: IRGroup = { ...ir.groups[0]!, readonly: true };
    const c = classifyRule(ir, group, group.rules[0]!);
    expect(c).toMatchObject({ shape: "context-free", editable: false, readOnlyReason: "readonly-group" });
  });

  it("beep, context(n) and use() outputs are complex-output", () => {
    for (const l of ["+ [K_A] > beep", "+ [K_A] > context(1) 'x'", "'a' + [K_A] > context(1) 'x'"]) {
      const c = cls(l);
      expect(c, l).toMatchObject({ editable: false, readOnlyReason: "complex-output", output: null });
    }
    const useOut = classifyRule(irOf("+ [K_A] > 'x'"), irOf("").groups[0]!, {
      nodeId: "r#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "x" }, { kind: "useGroup", groupName: "g2" }],
    });
    expect(useOut).toMatchObject({ editable: false, readOnlyReason: "complex-output" });
  });

  it("match > use(g) is group control flow, attributed to no key", () => {
    const ir = irOf("match > use(g2)\ngroup(g2)\n'x' > 'y'");
    const c = classifyRule(ir, ir.groups[0]!, ir.groups[0]!.rules[0]!);
    expect(c.keys).toEqual([]);
    expect(c.editable).toBe(false);
  });

  it("authorEdit marks the rule hand-set and is carried through", () => {
    const ir = irOf("+ [K_A] > 'x'");
    const rule: IRRule = { ...ir.groups[0]!.rules[0]!, authorEdit: "code-tab" };
    const c = classifyRule(ir, ir.groups[0]!, rule);
    expect(c.provenance).toBe("hand-set");
    expect(c.authorEdit).toBe("code-tab");
  });
});

describe("character key rules", () => {
  it("+ 'a' is attributed to K_A, + 'A' to K_A with SHIFT (the key Keyman uses)", () => {
    expect(cls("+ 'a' > 'x'").keys).toEqual([{ vkey: "K_A", layer: [] }]);
    expect(cls("+ 'A' > 'x'").keys).toEqual([{ vkey: "K_A", layer: ["SHIFT"] }]);
  });

  it("a character the US layout cannot type resolves to no key", () => {
    expect(cls("+ 'é' > 'x'").keys).toEqual([]);
  });
});
