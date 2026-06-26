// Tests for applyCarveToVfs — carve-deletion projection for the live OSK pipeline.
//
// Coverage:
//   1. No-op fast path when deletedNodeIds is empty (VFS not written).
//   2. Deleted group node: group + all its rules removed from emitted .kmn.
//   3. Deleted rule node: only that rule removed; group header survives.
//   4. Deleted store node: store removed from emitted .kmn.
//   5. Deleted raw fragment: fragment removed from emitted .kmn.
//   6. baseIr is NOT mutated.
//   7. Warning produced when emit fails (invalid IR).

import { describe, it, expect, vi } from "vitest";
import { applyCarveToVfs } from "./applyCarveToVfs.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR, IRGroup, IRStore, IRRule } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStore(nodeId: string, name: string, isSystem = true): IRStore {
  return {
    nodeId,
    name,
    items: [{ kind: "char", value: "1" }],
    isSystem,
  };
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

function makeIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [
      makeStore("store#VERSION", "VERSION"),
      makeStore("store#NAME", "NAME"),
      ...stores,
    ],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function makeVfs(kmnContent = "c original\n") {
  return createVirtualFS([
    { path: "source/test.kmn", content: kmnContent, isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyCarveToVfs — no-op when deletedNodeIds is empty", () => {
  it("does not write to VFS when the deletion set is empty", () => {
    const vfs = makeVfs("c original\n");
    const ir = makeIR([makeGroup("group#0", "main", [makeRule("rule#0")])]);
    const setSpy = vi.spyOn(vfs, "set");

    applyCarveToVfs(vfs, "test", ir, new Set());

    expect(setSpy).not.toHaveBeenCalled();
    // The VFS content is unchanged.
    const entry = vfs.get("source/test.kmn");
    expect(entry?.content).toBe("c original\n");
  });

  it("returns empty warnings when deletion set is empty", () => {
    const vfs = makeVfs();
    const ir = makeIR([makeGroup("group#0", "main", [makeRule("rule#0")])]);
    const result = applyCarveToVfs(vfs, "test", ir, new Set());
    expect(result.warnings).toHaveLength(0);
  });
});

describe("applyCarveToVfs — deletes a group", () => {
  it("removes the deleted group from the emitted .kmn", () => {
    const vfs = makeVfs();
    const groupA = makeGroup("group#A", "main", [makeRule("rule#0")]);
    const groupB = makeGroup("group#B", "extras", [makeRule("rule#1")]);
    const ir = makeIR([groupA, groupB]);

    applyCarveToVfs(vfs, "test", ir, new Set(["group#B"]));

    const entry = vfs.get("source/test.kmn");
    const content = entry?.content as string;
    expect(content).toContain("group(main)");
    expect(content).not.toContain("group(extras)");
  });

  it("does not mutate baseIr (group array is unchanged)", () => {
    const vfs = makeVfs();
    const groupA = makeGroup("group#A", "main", [makeRule("rule#0")]);
    const groupB = makeGroup("group#B", "extras", [makeRule("rule#1")]);
    const ir = makeIR([groupA, groupB]);
    const originalGroupCount = ir.groups.length;

    applyCarveToVfs(vfs, "test", ir, new Set(["group#B"]));

    // baseIr groups array is unchanged.
    expect(ir.groups.length).toBe(originalGroupCount);
    expect(ir.groups[1]?.nodeId).toBe("group#B");
  });
});

describe("applyCarveToVfs — deletes a rule", () => {
  it("removes only the deleted rule; group header survives", () => {
    const vfs = makeVfs();
    const rule0 = makeRule("rule#0");
    const rule1: IRRule = {
      nodeId: "rule#1",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "char", value: "b" }],
    };
    const group = makeGroup("group#main", "main", [rule0, rule1]);
    const ir = makeIR([group]);

    applyCarveToVfs(vfs, "test", ir, new Set(["rule#0"]));

    const content = vfs.get("source/test.kmn")?.content as string;
    // Group header survives.
    expect(content).toContain("group(main)");
    // rule#0 (K_A → a) is gone.
    expect(content).not.toContain("K_A");
    // rule#1 (K_B → b) is still there.
    expect(content).toContain("K_B");
  });

  it("does not mutate baseIr rules array", () => {
    const vfs = makeVfs();
    const rule0 = makeRule("rule#0");
    const rule1 = makeRule("rule#1");
    const group = makeGroup("group#main", "main", [rule0, rule1]);
    const ir = makeIR([group]);

    applyCarveToVfs(vfs, "test", ir, new Set(["rule#0"]));

    // baseIr's group still has both rules.
    expect(ir.groups[0]?.rules.length).toBe(2);
  });
});

describe("applyCarveToVfs — deletes a store", () => {
  it("removes the deleted store from the emitted .kmn", () => {
    const vfs = makeVfs();
    const extraStore = makeStore("store#EXTRA", "EXTRA", false);
    const ir = makeIR([makeGroup("group#main", "main", [makeRule("rule#0")])], [extraStore]);

    applyCarveToVfs(vfs, "test", ir, new Set(["store#EXTRA"]));

    const content = vfs.get("source/test.kmn")?.content as string;
    expect(content).not.toContain("EXTRA");
  });
});

describe("applyCarveToVfs — fragment-bearing keyboards (gate-1 removed)", () => {
  it("proceeds with re-emit when IR has opaque/raw fragments (gate-1 removed)", () => {
    // Previously gate-1 would skip re-emit for fragment-bearing keyboards.
    // With the faithful-emit fix, fragment-bearing keyboards are now supported.
    const originalContent = "c original\n";
    const vfs = makeVfs(originalContent);
    // rule#0 uses K_A; rule#1 uses K_B — delete K_A only, K_B must survive.
    const ruleA: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
    };
    const ruleB: IRRule = {
      nodeId: "rule#1",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "char", value: "b" }],
    };
    const ir: KeyboardIR = {
      ...makeIR([makeGroup("group#main", "main", [ruleA, ruleB])]),
      raw: [
        {
          nodeId: "raw#0",
          origin: "imported",
          sourceText: "c OPAQUE FRAGMENT",
          reason: "call/return",
          groupNodeId: "group#main",
        },
      ],
    };
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyCarveToVfs(vfs, "test", ir, new Set(["rule#0"]));

    // VFS MUST have been written (the re-emit ran).
    expect(setSpy).toHaveBeenCalledOnce();
    // No gate-1 warning about opaque fragments.
    expect(warnings.every((w) => !w.includes("opaque/raw fragment"))).toBe(true);
    // K_A rule was deleted; K_B must survive.
    const content = vfs.get("source/test.kmn")?.content as string;
    expect(content).not.toContain("K_A");
    expect(content).toContain("K_B");
  });

  it("does not mutate baseIr when projecting a fragment-bearing keyboard", () => {
    const vfs = makeVfs();
    const ir: KeyboardIR = {
      ...makeIR([makeGroup("group#main", "main", [makeRule("rule#0")])]),
      raw: [
        {
          nodeId: "raw#0",
          origin: "imported",
          sourceText: "c FRAG",
          reason: "call/return",
          groupNodeId: "group#main",
        },
      ],
    };

    applyCarveToVfs(vfs, "test", ir, new Set(["rule#0"]));

    // baseIr.raw is unchanged.
    expect(ir.raw.length).toBe(1);
  });

  it("fragment is removed from emitted .kmn when its nodeId is in deletedNodeIds", () => {
    const vfs = makeVfs();
    const ir: KeyboardIR = {
      ...makeIR([makeGroup("group#main", "main", [makeRule("rule#0")])]),
      raw: [
        {
          nodeId: "raw#frag",
          origin: "imported",
          sourceText: "save(opaqueFlag, 1)",
          reason: "save/set/reset option-store",
          groupNodeId: "group#main",
        },
      ],
    };

    applyCarveToVfs(vfs, "test", ir, new Set(["raw#frag"]));

    const content = vfs.get("source/test.kmn")?.content as string;
    expect(content).not.toContain("save(opaqueFlag");
  });
});

describe("applyCarveToVfs — safety gate: entry-group deletion", () => {
  it("skips re-emit and returns a warning when the entry group would be deleted", () => {
    const originalContent = "c original\n";
    const vfs = makeVfs(originalContent);
    // entryGroup is the first non-readonly group.
    const entryGroup = makeGroup("group#entry", "main", [makeRule("rule#0")]);
    const secondGroup = makeGroup("group#second", "extras", [makeRule("rule#1")]);
    const ir = makeIR([entryGroup, secondGroup]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyCarveToVfs(vfs, "test", ir, new Set(["group#entry"]));

    // VFS must be unchanged.
    expect(setSpy).not.toHaveBeenCalled();
    expect(vfs.get("source/test.kmn")?.content).toBe(originalContent);
    // Warning must mention the entry group.
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/entry group/i);
  });

  it("allows deletion of a non-entry group without triggering the entry-group guard", () => {
    const vfs = makeVfs();
    const entryGroup = makeGroup("group#entry", "main", [makeRule("rule#0")]);
    const secondGroup = makeGroup("group#second", "extras", [makeRule("rule#1")]);
    const ir = makeIR([entryGroup, secondGroup]);

    const { warnings } = applyCarveToVfs(vfs, "test", ir, new Set(["group#second"]));

    // No entry-group warning.
    expect(warnings.every((w) => !w.includes("entry group"))).toBe(true);
    // VFS was written (the re-emit ran).
    const content = vfs.get("source/test.kmn")?.content as string;
    expect(content).toContain("group(main)");
    expect(content).not.toContain("group(extras)");
  });
});

describe("applyCarveToVfs — returns warnings", () => {
  it("returns empty warnings on a successful projection", () => {
    const vfs = makeVfs();
    const ir = makeIR([makeGroup("group#main", "main", [makeRule("rule#0")])]);
    const { warnings } = applyCarveToVfs(vfs, "test", ir, new Set(["rule#0"]));
    expect(warnings).toHaveLength(0);
  });
});
