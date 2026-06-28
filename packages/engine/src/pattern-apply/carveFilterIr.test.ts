// Tests for carveFilterIr — the pure deletion-filtered KeyboardIR producer.
//
// Coverage:
//   1. Empty deletion set → structurally equal IR (no nodes dropped).
//   2. Deleted group node: group + all its rules removed.
//   3. Deleted rule node: only that rule removed; group header survives.
//   4. Deleted store node: store removed.
//   5. Deleted raw fragment: fragment removed.
//   6. header + comments pass through untouched.
//   7. baseIr is NOT mutated.
//   8. Structural sharing: a group with no deleted rules keeps its reference.

import { describe, it, expect } from "vitest";
import { carveFilterIr } from "./carveFilterIr.js";
import type {
  KeyboardIR,
  IRGroup,
  IRStore,
  IRRule,
  RawKmnFragment,
  IRComment,
} from "@keyboard-studio/contracts";

function makeStore(nodeId: string, name: string): IRStore {
  return { nodeId, name, items: [{ kind: "char", value: "1" }], isSystem: false };
}

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

function makeRaw(nodeId: string, text: string): RawKmnFragment {
  return { nodeId, kind: "raw", text };
}

function makeComment(nodeId: string, text: string): IRComment {
  return { nodeId, text };
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

describe("carveFilterIr", () => {
  it("returns a structurally equal IR for an empty deletion set", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0")])],
      stores: [makeStore("s0", "letters")],
    });
    const out = carveFilterIr(ir, new Set());
    expect(out).toEqual(ir);
    expect(out).not.toBe(ir); // fresh top-level object
  });

  it("drops a whole group (header + rules) when the group nodeId is deleted", () => {
    const ir = makeIR({
      groups: [
        makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")]),
        makeGroup("g1", "extra", [makeRule("r2")]),
      ],
    });
    const out = carveFilterIr(ir, new Set(["g0"]));
    expect(out.groups.map((g) => g.nodeId)).toEqual(["g1"]);
  });

  it("drops only the targeted rule and keeps the group header", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")])],
    });
    const out = carveFilterIr(ir, new Set(["r0"]));
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]!.nodeId).toBe("g0");
    expect(out.groups[0]!.rules.map((r) => r.nodeId)).toEqual(["r1"]);
  });

  it("drops a deleted store node", () => {
    const ir = makeIR({ stores: [makeStore("s0", "a"), makeStore("s1", "b")] });
    const out = carveFilterIr(ir, new Set(["s0"]));
    expect(out.stores.map((s) => s.nodeId)).toEqual(["s1"]);
  });

  it("drops a deleted raw fragment", () => {
    const ir = makeIR({ raw: [makeRaw("f0", "store(a) 'x'"), makeRaw("f1", "store(b) 'y'")] });
    const out = carveFilterIr(ir, new Set(["f0"]));
    expect(out.raw.map((f) => f.nodeId)).toEqual(["f1"]);
  });

  it("passes header and comments through untouched", () => {
    const comments = [makeComment("c0", "; hello")];
    const ir = makeIR({ comments, groups: [makeGroup("g0", "main", [makeRule("r0")])] });
    const out = carveFilterIr(ir, new Set(["g0"]));
    expect(out.header).toEqual(ir.header);
    expect(out.comments).toBe(ir.comments); // passed by reference
  });

  it("never mutates baseIr", () => {
    const ir = makeIR({
      groups: [makeGroup("g0", "main", [makeRule("r0"), makeRule("r1")])],
      stores: [makeStore("s0", "a")],
      raw: [makeRaw("f0", "x")],
    });
    const snapshot = structuredClone(ir);
    carveFilterIr(ir, new Set(["g0", "s0", "f0", "r0"]));
    expect(ir).toEqual(snapshot);
  });

  it("keeps a group's reference when none of its rules were deleted (structural sharing)", () => {
    const untouched = makeGroup("g0", "main", [makeRule("r0")]);
    const ir = makeIR({
      groups: [untouched, makeGroup("g1", "extra", [makeRule("r1"), makeRule("r2")])],
    });
    const out = carveFilterIr(ir, new Set(["r1"]));
    // g0 untouched → same reference; g1 had a rule removed → fresh object.
    expect(out.groups[0]).toBe(untouched);
    expect(out.groups[1]).not.toBe(ir.groups[1]);
    expect(out.groups[1]!.rules.map((r) => r.nodeId)).toEqual(["r2"]);
  });
});
