/**
 * The IR members added in spec 116 phase 6 (`layer`, `set`, `save`, `reset`, `call`,
 * `return`, `platform`, store `outs`): runtime schemas, and the contract-level readers
 * that must treat each as the `raw` element or fragment it replaces.
 */

import { describe, expect, it } from "vitest";
import {
  ContextElementSchema,
  OutputElementSchema,
  StoreItemSchema,
} from "./schemas.js";
import type { ContextElement, IRRule, OutputElement, StoreItem } from "./keyboard-ir.js";
import { buildProducedSet } from "./ir/producedSet.js";
import { storeItemText } from "./ir/storeItemText.js";
import { makeTestIR } from "./fixtures/keyboard-ir.js";
import { charStore, irGroup, vkeyRule } from "./fixtures/ir-builders.js";
import { ruleConditions, ruleKeystroke, rulePreContext } from "./rule-shape.js";

describe("runtime schemas accept every member of the three unions", () => {
  const outputs: OutputElement[] = [
    { kind: "layer", value: "shift" },
    { kind: "set", storeRef: "&layer", value: [{ kind: "char", value: "x" }] },
    { kind: "set", storeRef: "opt", value: [{ kind: "deadkey", id: 1 }, { kind: "outs", storeRef: "s" }] },
    { kind: "save", storeRef: "opt" },
    { kind: "reset", storeRef: "opt" },
    { kind: "call", storeRef: "cb" },
    { kind: "return" },
  ];
  it.each(outputs.map((o) => [o.kind, o] as const))("OutputElement %s", (_k, el) => {
    expect(OutputElementSchema.parse(el)).toEqual(el);
  });

  it("ContextElement platform", () => {
    const el: ContextElement = { kind: "platform", value: "touch" };
    expect(ContextElementSchema.parse(el)).toEqual(el);
  });

  it("StoreItem outs", () => {
    const el: StoreItem = { kind: "outs", storeRef: "s" };
    expect(StoreItemSchema.parse(el)).toEqual(el);
  });

  it("rejects a member with a missing field and an unknown kind", () => {
    expect(OutputElementSchema.safeParse({ kind: "set", storeRef: "opt" }).success).toBe(false);
    expect(OutputElementSchema.safeParse({ kind: "layer" }).success).toBe(false);
    expect(ContextElementSchema.safeParse({ kind: "platform" }).success).toBe(false);
    expect(StoreItemSchema.safeParse({ kind: "outs" }).success).toBe(false);
    expect(StoreItemSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });
});

describe("producedSet: typed statements and store outs", () => {
  const ruleWith = (output: OutputElement[]): IRRule => vkeyRule({ output });

  it("a typed layer / statement flushes a char run like the raw element it replaces", () => {
    const raw: OutputElement = { kind: "raw", text: "layer('shift')" };
    const typed: OutputElement[] = [
      { kind: "layer", value: "shift" },
      { kind: "set", storeRef: "opt", value: [{ kind: "char", value: "1" }] },
      { kind: "save", storeRef: "opt" },
      { kind: "reset", storeRef: "opt" },
      { kind: "call", storeRef: "cb" },
      { kind: "return" },
    ];
    const build = (mid: OutputElement) =>
      buildProducedSet(
        makeTestIR([
          irGroup({
            rules: [ruleWith([{ kind: "char", value: "e" }, mid, { kind: "char", value: "́" }])],
          }),
        ]),
      );
    const before = build(raw);
    // The raw element splits the run: `e` and U+0301 stay apart (no NFC `é`).
    expect(before.has("é")).toBe(false);
    for (const el of typed) expect([...build(el)].sort()).toEqual([...before].sort());
  });

  it("a store holding an outs() item contributes nothing, as its pre-116 opaque fragment did", () => {
    // buildProducedSet is a FROZEN view (spec 063 FR-008/FR-010): it pins the committed
    // facet index. Before spec 116 such a store was an `outs-expansion` fragment, absent
    // from ir.stores, so index() into it produced nothing. Typing must not move that.
    const outsStore: StoreItem[] = [{ kind: "outs", storeRef: "base" }, { kind: "char", value: "z" }];
    const ir = makeTestIR(
      [irGroup({ rules: [ruleWith([{ kind: "index", storeRef: "all", offset: 1 }])] })],
      [
        charStore({ name: "base", chars: "ab" }),
        { nodeId: "s-all", name: "all", items: outsStore, isSystem: false },
      ],
    );
    expect([...buildProducedSet(ir)].sort()).toEqual([]);
  });
});

describe("storeItemText: an outs item is a reference, not text", () => {
  it("yields the non-text placeholder", () => {
    expect(storeItemText({ kind: "outs", storeRef: "s" })).toBe("");
    expect(storeItemText({ kind: "outs", storeRef: "s" }, "?")).toBe("?");
  });
});

describe("rule-shape: a typed platform is a head condition, as the raw one was", () => {
  const key: ContextElement = { kind: "vkey", name: "K_A", modifiers: [] };
  const rule = (head: ContextElement): IRRule =>
    ({ nodeId: "r", context: [head, key], output: [{ kind: "char", value: "a" }] }) as IRRule;
  const group = { usingKeys: true };

  it.each([
    ["typed", { kind: "platform", value: "touch" } as ContextElement],
    ["raw", { kind: "raw", text: "platform('touch')" } as ContextElement],
  ])("%s platform: one condition, no pre-context, keystroke is the key", (_name, head) => {
    const r = rule(head);
    expect(ruleConditions(r)).toHaveLength(1);
    expect(rulePreContext(r, group)).toEqual([]);
    expect(ruleKeystroke(r, group)).toEqual(key);
  });
});
