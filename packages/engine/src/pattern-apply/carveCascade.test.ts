// Tests for resolveCarveCascade — the shared "what does this deletion set
// actually touch" resolver used by both carveFilterIr (IR-filter path) and
// carveViaSplice (text-splice path).

import { describe, it, expect } from "vitest";
import { resolveCarveCascade } from "./carveCascade.js";
import type { KeyboardIR, IRGroup, IRStore, IRRule, RawKmnFragment } from "@keyboard-studio/contracts";

function makeRule(nodeId: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output: [{ kind: "char", value: "a" }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeStore(nodeId: string, name: string): IRStore {
  return { nodeId, name, items: [{ kind: "char", value: "1" }], isSystem: false };
}

function makeRaw(nodeId: string): RawKmnFragment {
  return { nodeId, origin: "imported", sourceText: "x", reason: "test" };
}

function makeIR(opts?: {
  groups?: IRGroup[];
  stores?: IRStore[];
  raw?: RawKmnFragment[];
}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: ["en"],
      copyright: "(c) test",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: opts?.stores ?? [],
    groups: opts?.groups ?? [],
    comments: [],
    raw: opts?.raw ?? [],
    recognizedPatterns: [],
  };
}

describe("resolveCarveCascade", () => {
  it("cascades a deleted group's own rules into deletedRuleIds without them being separately listed", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")])],
    });
    const cascade = resolveCarveCascade(ir, new Set(["g0"]));
    expect(cascade.deletedGroupIds.has("g0")).toBe(true);
    expect(cascade.deletedRuleIds.has("r0")).toBe(true);
    expect(cascade.deletedRuleIds.has("r1")).toBe(true);
  });

  it("resolves an individually deleted rule without touching its surviving group", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")])],
    });
    const cascade = resolveCarveCascade(ir, new Set(["r0"]));
    expect(cascade.deletedGroupIds.size).toBe(0);
    expect([...cascade.deletedRuleIds]).toEqual(["r0"]);
  });

  it("resolves deleted stores and raw fragments independently of groups", () => {
    const ir = makeIR({
      stores: [makeStore("s0", "a"), makeStore("s1", "b")],
      raw: [makeRaw("f0"), makeRaw("f1")],
    });
    const cascade = resolveCarveCascade(ir, new Set(["s0", "f1"]));
    expect([...cascade.deletedStoreIds]).toEqual(["s0"]);
    expect([...cascade.deletedRawIds]).toEqual(["f1"]);
  });

  it("returns empty sets for an empty deletion set", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0")])],
      stores: [makeStore("s0", "a")],
      raw: [makeRaw("f0")],
    });
    const cascade = resolveCarveCascade(ir, new Set());
    expect(cascade.deletedGroupIds.size).toBe(0);
    expect(cascade.deletedRuleIds.size).toBe(0);
    expect(cascade.deletedStoreIds.size).toBe(0);
    expect(cascade.deletedRawIds.size).toBe(0);
  });
});
