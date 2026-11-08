// Spec 113 T007: the `kmn-edits` decision value round-trips through its zod
// mirror, and malformed entries are refused at the load boundary.
import { describe, expect, it } from "vitest";
import type { IRChange, KmnEdit, KmnEditsValue, LayoutOperation } from "./index";
import { isLayoutOperation } from "./index";
import { KmnEditSchema, KmnEditsValueSchema, LayoutOperationSchema } from "./schemas";

const OPS: LayoutOperation[] = [
  { seq: 1, at: 1000, op: "set-key", vkey: "K_Q", layer: [], output: { kind: "text", text: "ŋ" } },
  { seq: 2, at: 1001, op: "set-key", vkey: "K_QUOTE", layer: ["RALT"], output: { kind: "deadkey", deadkeyId: "3001" } },
  { seq: 3, at: 1002, op: "set-key", vkey: "K_W", layer: ["SHIFT", "RALT"], output: { kind: "nul" } },
  { seq: 4, at: 1003, op: "clear-key", vkey: "K_Q", layer: [] },
  {
    seq: 5,
    at: 1004,
    op: "set-row",
    vkey: "K_E",
    layer: [],
    context: [{ kind: "deadkey", deadkeyId: "acute" }],
    becomes: [{ kind: "text", text: "é" }],
  },
  { seq: 6, at: 1005, op: "set-row", vkey: "K_G", layer: [], context: [{ kind: "text", text: "n" }], becomes: { kind: "nul" } },
  { seq: 7, at: 1006, op: "remove-row", vkey: "K_G", layer: [], context: [{ kind: "text", text: "n" }] },
  { seq: 8, at: 1007, op: "decline-case-partner", vkey: "K_Q", layer: [], partner: "Ŋ" },
];

describe("LayoutOperationSchema", () => {
  it.each(OPS.map((op) => [op.op, op] as const))("parses a %s entry unchanged", (_op, op) => {
    expect(LayoutOperationSchema.parse(op)).toEqual(op);
  });

  it("rejects an unknown op", () => {
    expect(LayoutOperationSchema.safeParse({ seq: 1, at: 0, op: "swap-key", vkey: "K_A", layer: [] }).success).toBe(false);
  });

  it("rejects an entry with no vkey", () => {
    expect(LayoutOperationSchema.safeParse({ seq: 1, at: 0, op: "clear-key", layer: [] }).success).toBe(false);
  });

  it("rejects empty text in an output, a context, or a result", () => {
    const empty = { kind: "text", text: "" };
    expect(LayoutOperationSchema.safeParse({ ...OPS[0], output: empty }).success).toBe(false);
    expect(LayoutOperationSchema.safeParse({ ...OPS[4], context: [empty] }).success).toBe(false);
    expect(LayoutOperationSchema.safeParse({ ...OPS[4], becomes: [empty] }).success).toBe(false);
  });

  it("rejects an unknown modifier in the layer", () => {
    expect(LayoutOperationSchema.safeParse({ ...OPS[3], layer: ["HYPER"] }).success).toBe(false);
  });
});

describe("KmnEditsValueSchema", () => {
  it("parses a value with every op kind", () => {
    const value: KmnEditsValue = { entries: OPS };
    expect(KmnEditsValueSchema.parse(value)).toEqual(value);
  });

  it("parses an empty value", () => {
    expect(KmnEditsValueSchema.parse({ entries: [] })).toEqual({ entries: [] });
  });

  it("rejects a non-monotonic seq", () => {
    const result = KmnEditsValueSchema.safeParse({ entries: [OPS[1], OPS[0]] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["entries", 1, "seq"]);
  });

  it("rejects a repeated seq", () => {
    expect(KmnEditsValueSchema.safeParse({ entries: [OPS[0], { ...OPS[1], seq: 1 }] }).success).toBe(false);
  });
});

// Spec 113 T090: Code-tab entries are additive arms of the same union.
const RULE = {
  nodeId: "rule#9",
  context: [{ kind: "vkey" as const, name: "K_A", modifiers: [] }],
  output: [{ kind: "char" as const, value: "b" }],
};
const STORE = { name: "keys", items: [{ kind: "char" as const, value: "a" }], isSystem: false };
const ANCHOR = { container: { kind: "group" as const, name: "main", usingKeys: true }, text: "+ [K_A] > 'a'" };
const CHANGES: IRChange[] = [
  { change: "insert", at: { ...ANCHOR, prev: "x", next: "y" }, node: RULE },
  { change: "remove", at: ANCHOR, old: RULE },
  { change: "replace", at: ANCHOR, old: RULE, node: { ...RULE, nodeId: "rule#10" } },
  { change: "set-store", name: "keys", value: STORE, previous: { ...STORE, items: [] }, after: "other" },
  { change: "remove-store", name: "keys", previous: STORE },
  { change: "add-group", group: { nodeId: "group#2", name: "g", usingKeys: false, rules: [], readonly: false }, after: "main" },
  { change: "remove-group", previous: { nodeId: "group#2", name: "g", usingKeys: false, rules: [], readonly: false } },
  { change: "set-begin", begin: { encoding: "Unicode", main: "g" }, previous: { encoding: "Unicode", main: "main" } },
  { change: "set-header", header: { name: "B" }, previous: { name: "A" } },
];

describe("Code-tab entries", () => {
  const codeEdit: KmnEdit = {
    seq: 9,
    at: 2000,
    op: "code-apply",
    changes: CHANGES,
    overrides: [{ change: 1, owner: "deadkeys" }],
  };
  const kept: KmnEdit = { seq: 10, at: 2001, op: "review-kept", target: 9 };

  it("round-trips a CodeEdit holding every IRChange kind", () => {
    expect(KmnEditSchema.parse(codeEdit)).toEqual(codeEdit);
    expect(CHANGES.map((c) => c.change)).toHaveLength(9);
  });

  it("round-trips a ReviewKept", () => {
    expect(KmnEditSchema.parse(kept)).toEqual(kept);
  });

  it("round-trips a value mixing Layout and Code entries", () => {
    const value: KmnEditsValue = { entries: [OPS[0]!, codeEdit, kept] };
    expect(KmnEditsValueSchema.parse(value)).toEqual(value);
  });

  it("rejects an unknown change kind, an unknown owner, and a negative target", () => {
    expect(KmnEditSchema.safeParse({ ...codeEdit, changes: [{ change: "swap" }] }).success).toBe(false);
    expect(KmnEditSchema.safeParse({ ...codeEdit, overrides: [{ change: 0, owner: "nobody" }] }).success).toBe(false);
    expect(KmnEditSchema.safeParse({ ...kept, target: -1 }).success).toBe(false);
  });

  it("keeps the strictly increasing seq rule across arms", () => {
    expect(KmnEditsValueSchema.safeParse({ entries: [codeEdit, { ...kept, seq: 9 }] }).success).toBe(false);
  });

  it("isLayoutOperation separates the arms", () => {
    expect(isLayoutOperation(OPS[0]!)).toBe(true);
    expect(isLayoutOperation(codeEdit)).toBe(false);
    expect(isLayoutOperation(kept)).toBe(false);
  });
});
