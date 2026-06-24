// End-to-end regression for issue #529: deletedItemIds path in projectWorkingCopyVfs.
//
// This file does NOT mock @keyboard-studio/engine. It exercises the real
// applyCarveToVfs so we can observe the actual emitted .kmn content —
// proving that a rule removed via deletedItemIds truly leaves the output.
//
// AC#1: toggling a simple (non-deadkey) character off in the Carve Gallery
//       removes its rule from the emitted .kmn.
//
// The file must remain free of vi.mock("@keyboard-studio/engine", ...) so
// the real emission pipeline runs.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixture helpers — mirrored from applyCarveToVfs.test.ts shapes
// ---------------------------------------------------------------------------

function makeRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}


function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs deleted-items end-to-end — real engine, no mock", () => {
  // AC#1: deletedItemIds removes rule#0 (K_A) from the emitted .kmn
  // while leaving rule#1 (K_B) and the group header intact.
  it("AC#1: removes rule#0 (K_A) via deletedItemIds; K_B and group header survive", () => {
    const rule0 = makeRule("rule#0", "K_A", "a");
    const rule1 = makeRule("rule#1", "K_B", "b");
    // Use a non-entry second group for deletion safety — but deleting a RULE
    // from the entry group is safe (we're not deleting the group itself).
    const entryGroup = makeGroup("group#main", "main", [rule0, rule1]);
    const ir = makeTestIR([entryGroup]);
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["rule#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // No safety-gate warnings should fire.
    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Group header must survive.
    expect(content).toContain("group(main)");

    // rule#0 (K_A -> a) must be absent.
    expect(content).not.toContain("K_A");

    // rule#1 (K_B -> b) must be present.
    expect(content).toContain("K_B");
  });

  // Complement: when deletedItemIds is empty, both rules survive unchanged.
  it("preserves both rules when deletedItemIds is empty", () => {
    const rule0 = makeRule("rule#0", "K_A", "a");
    const rule1 = makeRule("rule#1", "K_B", "b");
    const entryGroup = makeGroup("group#main", "main", [rule0, rule1]);
    const ir = makeTestIR([entryGroup]);
    const vfs = makeVfs("test_kb");

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // No re-emit occurs when both sets are empty; original stub content is unchanged.
    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(content).toBe("c stub\n");
  });

  // deletedItemIds + deletedNodeIds union: rule#0 via itemIds, group#B via nodeIds.
  it("removes both rule#0 (via deletedItemIds) and group#B (via deletedNodeIds) in one pass", () => {
    const rule0 = makeRule("rule#0", "K_A", "a");
    const rule1 = makeRule("rule#1", "K_B", "b");
    const entryGroup = makeGroup("group#main", "main", [rule0, rule1]);
    const secondGroup = makeGroup("group#B", "extras", [makeRule("rule#2", "K_C", "c")]);
    const ir = makeTestIR([entryGroup, secondGroup]);
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(["group#B"]),
      deletedItemIds: new Set(["rule#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Entry group header survives.
    expect(content).toContain("group(main)");
    // rule#0 (K_A) gone via deletedItemIds.
    expect(content).not.toContain("K_A");
    // rule#1 (K_B) still present.
    expect(content).toContain("K_B");
    // group#B (extras) gone via deletedNodeIds.
    expect(content).not.toContain("group(extras)");
    // rule#2 (K_C) gone along with group#B.
    expect(content).not.toContain("K_C");
  });

  // baseIr must not be mutated by the projection.
  it("does not mutate baseIr when deletedItemIds is used", () => {
    const rule0 = makeRule("rule#0", "K_A", "a");
    const rule1 = makeRule("rule#1", "K_B", "b");
    const entryGroup = makeGroup("group#main", "main", [rule0, rule1]);
    const ir = makeTestIR([entryGroup]);
    const vfs = makeVfs("test_kb");

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["rule#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // baseIr must still have both rules.
    expect(ir.groups[0]?.rules.length).toBe(2);
    expect(ir.groups[0]?.rules[0]?.nodeId).toBe("rule#0");
  });
});
