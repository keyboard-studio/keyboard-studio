// Tests for resolveCarveCascade — the shared "what does this deletion set
// actually touch" resolver used by both carveFilterIr (IR-filter path) and
// carveViaSplice (text-splice path).

import { describe, it, expect } from "vitest";
import { resolveCarveCascade } from "./carveCascade.js";
import type {
  KeyboardIR,
  IRComment,
  IRGroup,
  IRStore,
  IRRule,
  RawKmnFragment,
} from "@keyboard-studio/contracts";

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

function makeRaw(nodeId: string, groupNodeId?: string): RawKmnFragment {
  return {
    nodeId,
    origin: "imported",
    sourceText: "x",
    reason: "test",
    ...(groupNodeId !== undefined ? { groupNodeId } : {}),
  };
}

function makeIR(opts?: {
  groups?: IRGroup[];
  stores?: IRStore[];
  raw?: RawKmnFragment[];
  comments?: IRComment[];
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
    comments: opts?.comments ?? [],
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
    expect(cascade.deletedCommentIds.size).toBe(0);
  });

  it("cascades a deleted group into its group-owned RawKmnFragment nodes; other groups' fragments survive", () => {
    const ir = makeIR({
      groups: [
        makeGroup("g0", "main", [makeRule("r0")]),
        makeGroup("g1", "other", [makeRule("r1")]),
      ],
      raw: [makeRaw("f0", "g0"), makeRaw("f1", "g1"), makeRaw("f2")],
    });
    const cascade = resolveCarveCascade(ir, new Set(["g0"]));
    // f0 is owned by the deleted group -> cascaded out with it.
    expect(cascade.deletedRawIds.has("f0")).toBe(true);
    // f1 (other group) and f2 (global, no owning group) survive.
    expect(cascade.deletedRawIds.has("f1")).toBe(false);
    expect(cascade.deletedRawIds.has("f2")).toBe(false);
  });

  it("cascades comments anchored to a deleted node (leading and trailing); freestanding and surviving-anchor comments do not cascade", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")])],
      comments: [
        { nodeId: "c0", text: "docs r0", anchor: "leading", anchorRef: { kind: "rule", nodeId: "r0" } },
        { nodeId: "c1", text: "inline r0", anchor: "trailing", anchorRef: { kind: "rule", nodeId: "r0" } },
        { nodeId: "c2", text: "docs r1", anchor: "leading", anchorRef: { kind: "rule", nodeId: "r1" } },
        { nodeId: "c3", text: "freestanding", anchor: "freestanding" },
      ],
    });
    const cascade = resolveCarveCascade(ir, new Set(["r0"]));
    expect(cascade.deletedCommentIds.has("c0")).toBe(true);
    expect(cascade.deletedCommentIds.has("c1")).toBe(true);
    // Anchored to a SURVIVING rule -> survives.
    expect(cascade.deletedCommentIds.has("c2")).toBe(false);
    // Freestanding (no anchorRef) -> never deleted via carve.
    expect(cascade.deletedCommentIds.has("c3")).toBe(false);
  });

  it("a whole-group deletion cascades through to comments anchored to the group's own rules", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0")])],
      comments: [
        { nodeId: "c0", text: "docs r0", anchor: "leading", anchorRef: { kind: "rule", nodeId: "r0" } },
        { nodeId: "cg", text: "docs g0", anchor: "leading", anchorRef: { kind: "group", nodeId: "g0" } },
      ],
    });
    const cascade = resolveCarveCascade(ir, new Set(["g0"]));
    expect(cascade.deletedCommentIds.has("c0")).toBe(true);
    expect(cascade.deletedCommentIds.has("cg")).toBe(true);
  });
});
