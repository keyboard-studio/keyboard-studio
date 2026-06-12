import { describe, it, expect } from "vitest";
import { emit } from "./emit.js";
import type { KeyboardIR, IRGroup, IRRule, IRStore, IRComment } from "@keyboard-studio/contracts";

function makeIR(): KeyboardIR {
  const stores: IRStore[] = [
    {
      nodeId: "store#0",
      name: "VERSION",
      items: [{ kind: "char", value: "1" }, { kind: "char", value: "0" }, { kind: "char", value: "." }, { kind: "char", value: "0" }],
      isSystem: true,
    },
    {
      nodeId: "store#1",
      name: "NAME",
      items: [{ kind: "char", value: "T" }, { kind: "char", value: "e" }, { kind: "char", value: "s" }, { kind: "char", value: "t" }],
      isSystem: true,
    },
  ];
  const rules: IRRule[] = [
    {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
    },
    {
      nodeId: "rule#1",
      context: [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT"] }],
      output: [{ kind: "char", value: "A" }],
    },
  ];
  const group: IRGroup = {
    nodeId: "group#0",
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
  const ir: KeyboardIR = {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores,
    groups: [group],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
  return ir;
}

describe("emit", () => {
  it("includes begin Unicode > use(main)", () => {
    const out = emit(makeIR());
    expect(out).toContain("begin Unicode > use(main)");
  });

  it("includes group(main) using keys", () => {
    const out = emit(makeIR());
    expect(out).toContain("group(main) using keys");
  });

  it("emits VERSION store first", () => {
    const out = emit(makeIR());
    const versionIdx = out.indexOf("store(&VERSION)");
    const nameIdx = out.indexOf("store(&NAME)");
    expect(versionIdx).toBeGreaterThanOrEqual(0);
    expect(versionIdx).toBeLessThan(nameIdx);
  });

  it("emits rules with + prefix and uppercase U+XXXX codepoints", () => {
    const out = emit(makeIR());
    // K_A -> a (U+0061 uppercase = U+0061)
    expect(out).toContain("+ [K_A] > U+0061");
    // SHIFT K_A -> A (U+0041)
    expect(out).toContain("+ [SHIFT K_A] > U+0041");
  });

  it("ends with a trailing newline", () => {
    const out = emit(makeIR());
    expect(out.endsWith("\n")).toBe(true);
  });

  it("emits deadkey in output as dk(nnnn)", () => {
    const ir = makeIR();
    const group = ir.groups[0];
    if (group) {
      group.rules.push({
        nodeId: "rule#2",
        context: [{ kind: "vkey", name: "K_2", modifiers: ["RALT"] }],
        output: [{ kind: "deadkey", id: 0x007e }],
      });
    }
    const out = emit(ir);
    expect(out).toContain("dk(007e)");
  });

  it("emits index(store, N) in output", () => {
    const ir = makeIR();
    const group = ir.groups[0];
    if (group) {
      group.rules.push({
        nodeId: "rule#3",
        context: [
          { kind: "deadkey", id: 0x007e },
          { kind: "any", storeRef: "dkf007e" },
        ],
        output: [{ kind: "index", storeRef: "dkt007e", offset: 2 }],
      });
    }
    const out = emit(ir);
    expect(out).toContain("index(dkt007e, 2)");
  });

  it("emits freestanding comments before stores", () => {
    const ir = makeIR();
    ir.comments.push({
      nodeId: "comment#0",
      text: "top comment",
      anchor: "freestanding",
    });
    const out = emit(ir);
    const commentIdx = out.indexOf("c top comment");
    const storeIdx = out.indexOf("store(");
    expect(commentIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeLessThan(storeIdx);
  });

  it("emits leading comment before the rule it anchors", () => {
    const ir = makeIR();
    const firstRuleId = ir.groups[0]?.rules[0]?.nodeId ?? "rule#0";
    const comment: IRComment = {
      nodeId: "comment#1",
      text: "rule comment",
      anchor: "leading",
      anchorRef: { kind: "rule", nodeId: firstRuleId },
    };
    ir.comments.push(comment);
    const out = emit(ir);
    const commentIdx = out.indexOf("c rule comment");
    const ruleIdx = out.indexOf("+ [K_A] > U+0061");
    expect(commentIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeLessThan(ruleIdx);
  });

  it("emits user store referenced by group rules", () => {
    const ir = makeIR();
    // Add a user store
    ir.stores.push({
      nodeId: "store#2",
      name: "myStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    });
    // Add a rule that references myStore
    ir.groups[0]?.rules.push({
      nodeId: "rule#4",
      context: [{ kind: "any", storeRef: "myStore" }],
      output: [{ kind: "char", value: "b" }],
    });
    const out = emit(ir);
    expect(out).toContain("store(myStore)");
  });

  it("emits RawKmnFragment sourceText verbatim", () => {
    const ir = makeIR();
    ir.raw.push({
      nodeId: "raw#0",
      origin: "imported",
      sourceText: "save(myFlag, 1)",
      reason: "option-store-directive",
    });
    const out = emit(ir);
    expect(out).toContain("save(myFlag, 1)");
  });
});

describe("emit: SMP codepoints", () => {
  it("emits SMP char in context as quoted literal, not U+XXXXX", () => {
    const ir = makeIR();
    // SMP char only in context; BMP char in output so assertions are isolated
    ir.groups[0]?.rules.push({
      nodeId: "rule#smp0",
      context: [{ kind: "char", value: "\u{11700}" }],
      output: [{ kind: "char", value: "a" }],
    });
    const out = emit(ir);
    expect(out).toContain("'\u{11700}'");
    expect(out).not.toContain("U+11700");
  });

  it("emits SMP char in output as quoted literal, not U+XXXXX", () => {
    const ir = makeIR();
    // BMP char in context; SMP char only in output so assertions are isolated
    ir.groups[0]?.rules.push({
      nodeId: "rule#smp1",
      context: [{ kind: "char", value: "a" }],
      output: [{ kind: "char", value: "\u{11701}" }],
    });
    const out = emit(ir);
    expect(out).toContain("'\u{11701}'");
    expect(out).not.toContain("U+11701");
  });
});
