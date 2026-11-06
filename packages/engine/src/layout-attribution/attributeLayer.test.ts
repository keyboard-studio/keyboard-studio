import { describe, expect, it } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { attributeLayer } from "./attributeLayer.js";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(bases) 'ae'
store(outs) 'áé'
store(opt) '0'
begin Unicode > use(main)
group(main) using keys
`;

function irOf(rules: string, head = HEAD): KeyboardIR {
  return parse(head + rules + "\n", "t").ir;
}

function cell(ir: KeyboardIR, vkey: string, layer: string[] = []) {
  return attributeLayer(ir, layer as never, [vkey])[0]!;
}

describe("attributeLayer plain behaviour", () => {
  it("one context-free rule: plain is editable text", () => {
    const c = cell(irOf("+ [K_A] > 'x'"), "K_A");
    expect(c.plain).toMatchObject({ shape: "context-free", editable: true, output: { kind: "text", text: "x" }, provenance: "starting-point" });
    expect(c.rows).toEqual([]);
    expect(c.unhandled).toBe(false);
    expect(c.frame).toBe(false);
  });

  it("a rule matches only its own layer", () => {
    const ir = irOf("+ [K_A] > 'a'\n+ [SHIFT K_A] > 'A'");
    expect(cell(ir, "K_A").plain?.output).toEqual({ kind: "text", text: "a" });
    expect(cell(ir, "K_A", ["SHIFT"]).plain?.output).toEqual({ kind: "text", text: "A" });
    expect(cell(ir, "K_A", ["RALT"]).unhandled).toBe(true);
  });

  it("two context-free rules on one key and layer: the second is a never-fires row", () => {
    const c = cell(irOf("+ [K_A] > 'x'\n+ [K_A] > 'y'"), "K_A");
    expect(c.plain).toMatchObject({ editable: true, output: { kind: "text", text: "x" } });
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]).toMatchObject({ shape: "context-free", editable: false, readOnlyReason: "never-fires" });
  });

  it("a read-only context-free rule before the plain rule makes plain read-only", () => {
    const c = cell(irOf("if(opt = '1') + [K_A] > 'q'\n+ [K_A] > 'x'"), "K_A");
    expect(c.plain).toMatchObject({ editable: false, readOnlyReason: "conditional", output: { kind: "text", text: "x" } });
    expect(c.rows).toEqual([expect.objectContaining({ shape: "conditional", editable: false })]);
  });

  it("a read-only context-free rule that always matches shadows the later plain rule; plain is the read-only one", () => {
    const c = cell(irOf("+ [K_A] > beep\n+ [K_A] > 'x'"), "K_A");
    expect(c.plain).toMatchObject({ editable: false, readOnlyReason: "complex-output" });
    expect(c.rows[0]).toMatchObject({ readOnlyReason: "never-fires" });
  });

  it("a read-only contextual row never makes the plain output read-only (FR-013)", () => {
    const ir = irOf("any(bases) + [K_A] > 'z'\n'n' + [K_A] > context(1)\n+ [K_A] > 'x'");
    const c = cell(ir, "K_A");
    expect(c.plain).toMatchObject({ editable: true, output: { kind: "text", text: "x" } });
    expect(c.rows).toHaveLength(2);
    expect(c.rows.every((r) => !r.editable)).toBe(true);
  });

  it("no matching rule: unhandled, no plain", () => {
    const c = cell(irOf("+ [K_A] > 'x'"), "K_B");
    expect(c).toMatchObject({ plain: null, rows: [], unhandled: true, frame: false });
  });

  it("frame keys: frame, never unhandled, no rows", () => {
    const c = cell(irOf("+ [K_BKSP] > 'x'"), "K_BKSP");
    expect(c).toMatchObject({ plain: null, rows: [], unhandled: false, frame: true });
  });

  it("authorEdit gives provenance hand-set", () => {
    const ir = irOf("+ [K_A] > 'x'");
    ir.groups[0]!.rules[0]!.authorEdit = "layout-tab";
    const c = cell(ir, "K_A");
    expect(c.plain).toMatchObject({ provenance: "hand-set", authorEdit: "layout-tab" });
  });

  it("a character key rule lands on the vkey Keyman uses", () => {
    const c = cell(irOf("+ 'a' > 'x'\n+ 'A' > 'X'"), "K_A");
    expect(c.plain?.output).toEqual({ kind: "text", text: "x" });
    expect(cell(irOf("+ 'a' > 'x'\n+ 'A' > 'X'"), "K_A", ["SHIFT"]).plain?.output).toEqual({ kind: "text", text: "X" });
  });

  it("a store-based key rule covers the keys of its store and is read-only", () => {
    const c = cell(irOf("+ any(bases) > index(outs, 1)"), "K_E");
    expect(c.plain).toMatchObject({ shape: "store-based", editable: false, readOnlyReason: "store-based", output: null });
  });

  it("an opaque fragment on the key (position unknown) makes plain read-only", () => {
    const ir = irOf("+ [K_A] > 'x'");
    ir.raw.push({
      nodeId: "raw#9",
      origin: "imported",
      sourceText: "+ [K_A] > call(foo)",
      reason: "call-return",
      groupNodeId: ir.groups[0]!.nodeId,
    });
    const c = cell(ir, "K_A");
    expect(c.plain).toMatchObject({ ruleNodeId: "rule#0", editable: false, readOnlyReason: "opaque" });
    expect(c.rows).toEqual([expect.objectContaining({ ruleNodeId: "raw#9", shape: "opaque", editable: false })]);
  });
});

describe("attributeLayer contextual rows", () => {
  it("lists deadkey and literal rows with shape, context and provenance", () => {
    const ir = irOf("+ [K_A] > 'a'\ndk(0001) + [K_A] > 'q'\n'n' + [K_A] > 'ñ'");
    ir.groups[0]!.rules[2]!.authorEdit = "code-tab";
    const c = cell(ir, "K_A");
    expect(c.plain?.editable).toBe(true);
    expect(c.rows).toHaveLength(2);
    expect(c.rows[0]).toMatchObject({
      shape: "deadkey-keystroke",
      editable: true,
      context: [{ kind: "deadkey", deadkeyId: "0001" }],
      output: [{ kind: "text", text: "q" }],
      provenance: "starting-point",
    });
    expect(c.rows[1]).toMatchObject({ shape: "literal-context", provenance: "hand-set", authorEdit: "code-tab" });
  });

  it("a key with only contextual rows is still unhandled for its plain behaviour", () => {
    const c = cell(irOf("dk(0001) + [K_A] > 'q'"), "K_A");
    expect(c.unhandled).toBe(true);
    expect(c.rows).toHaveLength(1);
  });

  it("a contextual row repeated with the same context is a never-fires row", () => {
    const c = cell(irOf("'n' + [K_A] > 'x'\n'n' + [K_A] > 'y'"), "K_A");
    expect(c.rows.map((r) => r.editable)).toEqual([true, false]);
    expect(c.rows[1]!.readOnlyReason).toBe("never-fires");
  });

  it("a fan-out table appears as one editable row on the key that types the base character", () => {
    const ir = irOf("+ [K_A] > 'a'\n+ [K_B] > 'b'\ndk(0001) + any(bases) > index(outs, 2)");
    const a = cell(ir, "K_A");
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({
      shape: "deadkey-fanout",
      editable: true,
      context: [{ kind: "deadkey", deadkeyId: "0001" }],
      output: [{ kind: "text", text: "á" }],
      fanoutIndex: 0,
    });
    expect(cell(ir, "K_B").rows).toEqual([]);
  });

  it("a fan-out row is read-only when the key's plain behaviour is", () => {
    const ir = irOf("if(opt = '1') + [K_A] > 'q'\n+ [K_A] > 'a'\ndk(0001) + any(bases) > index(outs, 2)");
    const a = cell(ir, "K_A");
    const fan = a.rows.find((r) => r.shape === "deadkey-fanout");
    expect(fan).toMatchObject({ editable: false, readOnlyReason: "conditional" });
  });
});

describe("attributeLayer fan-out on unhandled keys", () => {
  const head = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(lo) 'ae'
store(loOut) 'áé'
store(up) 'AE'
store(upOut) 'ÁÉ'
begin Unicode > use(main)
group(main) using keys
`;
  const ir = irOf("dk(0001) + any(lo) > index(loOut, 2)\ndk(0001) + any(up) > index(upOut, 2)", head);

  it("attaches rows to the key that types the US base character", () => {
    const a = cell(ir, "K_A");
    expect(a.unhandled).toBe(true);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ shape: "deadkey-fanout", editable: true, output: [{ kind: "text", text: "á" }], fanoutIndex: 0 });
    expect(cell(ir, "K_E").rows[0]).toMatchObject({ output: [{ kind: "text", text: "é" }], fanoutIndex: 1 });
    expect(cell(ir, "K_B").rows).toEqual([]);
  });

  it("uses the SHIFT layer for uppercase bases, and no other layer", () => {
    expect(cell(ir, "K_A", ["SHIFT"]).rows[0]).toMatchObject({ editable: true, output: [{ kind: "text", text: "Á" }] });
    expect(cell(ir, "K_A", ["RALT"]).rows).toEqual([]);
  });

  it("does not guess on a mnemonic keyboard", () => {
    const m = irOf("dk(0001) + any(lo) > index(loOut, 2)", head.replace("begin Unicode", "store(&MNEMONICLAYOUT) '1'\nbegin Unicode"));
    expect(cell(m, "K_A").rows).toEqual([]);
  });
});

describe("attributeLayer entry group and mnemonic", () => {
  it("reads the group begin Unicode uses, not the first group", () => {
    const head = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(second)
group(first) using keys
+ [K_A] > 'wrong'
group(second) using keys
`;
    const ir = irOf("+ [K_A] > 'right'", head);
    expect(cell(ir, "K_A").plain?.output).toEqual({ kind: "text", text: "right" });
  });

  it("a mnemonic keyboard's cells are read-only (mnemonic)", () => {
    const head = HEAD.replace("begin Unicode", "store(&MNEMONICLAYOUT) '1'\nbegin Unicode");
    const c = cell(irOf("+ [K_A] > 'x'", head), "K_A");
    expect(c.plain).toMatchObject({ editable: false, readOnlyReason: "mnemonic" });
  });
});
