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
import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
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

// Real .kmn fixtures for the warning-free carve assertions: parsing gives every
// node a resolvable source span, so the splice-first carve path runs (the same
// path production takes for an imported keyboard) instead of falling back to
// filter+emit with an informational warning. Hand-built makeTestIR fixtures
// (no sourceLine) are kept for the tests that don't assert on warnings.
const SPLICEABLE_KMN = [
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

const SPLICEABLE_KMN_WITH_EXTRAS = [
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
  "group(extras) using keys",
  "+ [K_C] > 'c'",
  "",
].join("\n");

function makeParsedVfs(keyboardId: string, kmn: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: kmn, isBinary: false },
  ]);
}

/** Find the nodeId of the rule whose output is the given char. */
function findRuleId(ir: KeyboardIR, char: string): string {
  const rule = ir.groups
    .flatMap((g) => g.rules)
    .find((r) => r.output.some((o) => o.kind === "char" && o.value === char));
  if (rule === undefined) throw new Error(`fixture rule producing '${char}' not found`);
  return rule.nodeId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs deleted-items end-to-end — real engine, no mock", () => {
  // AC#1: deletedItemIds removes rule#0 (K_A) from the emitted .kmn
  // while leaving rule#1 (K_B) and the group header intact.
  it("AC#1: removes the K_A rule via deletedItemIds; K_B and group header survive", () => {
    // Deleting a RULE from the entry group is safe (we're not deleting the
    // group itself). Parsed fixture: source spans resolve, splice path runs.
    const { ir } = parseKmn(SPLICEABLE_KMN, "test_kb");
    const vfs = makeParsedVfs("test_kb", SPLICEABLE_KMN);

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set([findRuleId(ir, "a")]),
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

    // The deleted rule (K_A -> a) must be absent.
    expect(content).not.toContain("K_A");

    // The surviving rule (K_B -> b) must be present.
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

  // deletedItemIds + deletedNodeIds union: the K_A rule via itemIds, the whole
  // extras group via nodeIds.
  it("removes both the K_A rule (via deletedItemIds) and group(extras) (via deletedNodeIds) in one pass", () => {
    const { ir } = parseKmn(SPLICEABLE_KMN_WITH_EXTRAS, "test_kb");
    const vfs = makeParsedVfs("test_kb", SPLICEABLE_KMN_WITH_EXTRAS);
    const extrasGroup = ir.groups.find((g) => g.name === "extras");
    if (extrasGroup === undefined) throw new Error("fixture group 'extras' not found");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set([extrasGroup.nodeId]),
      deletedItemIds: new Set([findRuleId(ir, "a")]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Entry group header survives.
    expect(content).toContain("group(main)");
    // The K_A rule is gone via deletedItemIds.
    expect(content).not.toContain("K_A");
    // The K_B rule is still present.
    expect(content).toContain("K_B");
    // group(extras) is gone via deletedNodeIds.
    expect(content).not.toContain("group(extras)");
    // The K_C rule is gone along with its group.
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

// ---------------------------------------------------------------------------
// Fragment-bearing keyboards — AC#1 durability (real engine, no mock)
// ---------------------------------------------------------------------------
// These tests exercise the full pipeline for keyboards that have opaque/raw
// fragments (ir.raw.length > 0). Prior to the #564 fix, applyCarveToVfs
// would bail out with a gate-1 warning and leave the VFS unchanged.
// With the fix, the position-faithful emit path runs and the deletion reaches
// the .kmn file.

describe("projectWorkingCopyVfs deleted-items + fragment-bearing keyboard — real engine, no mock", () => {
  // AC#1 durability: delete a rule from a fragment-bearing IR and verify:
  //   (a) the deleted rule is absent from the emitted .kmn
  //   (b) the surviving rule is still present
  //   (c) the user store referenced only by the opaque fragment is still present
  //   (d) the fragment itself appears in the emitted .kmn
  //   (e) the fragment appears before the surviving rule (position-faithful)
  //   (f) no opaque-fragment gate warning is returned
  //   (g) baseIr is not mutated
  it("AC#1: deletes a rule from a fragment-bearing keyboard; user store and fragment survive in order", () => {
    // Rule at sourceLine 30 (to be deleted).
    const rule0 = makeRule("rule#0", "K_A", "a");
    // Rule at sourceLine 35 (must survive).
    const rule1 = makeRule("rule#1", "K_B", "b");
    const entryGroup = makeGroup("group#main", "main", [rule0, rule1]);

    // Build a fragment-bearing IR:
    //   - A user store referenced only by the fragment (not by any typed rule)
    //     at sourceLine 22. Without the store-drop fix this would be silently
    //     omitted from the output.
    //   - An opaque fragment at sourceLine 25 that references opaqueStore.
    //   - Two typed rules at sourceLInes 30 and 35.
    const ir = makeTestIR([entryGroup]);
    ir.stores.push({
      nodeId: "store#opaque",
      name: "opaqueStore",
      items: [{ kind: "char", value: "x" }],
      isSystem: false,
      sourceLine: 22,
    });
    ir.raw.push({
      nodeId: "raw#frag",
      origin: "imported" as const,
      sourceText: "save(opaqueStore, 1)",
      reason: "save/set/reset option-store",
      sourceLine: 25,
      groupNodeId: "group#main",
    });
    // Attach sourceLine to the typed rules so the faithful-emit path can interleave them.
    (entryGroup.rules[0] as IRRule).sourceLine = 30;
    (entryGroup.rules[1] as IRRule).sourceLine = 35;

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

    // (f) No gate-1 warning about opaque/raw fragments.
    expect(warnings.every((w) => !w.toLowerCase().includes("opaque"))).toBe(true);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // (a) Deleted rule (K_A) must be absent.
    expect(content).not.toContain("K_A");

    // (b) Surviving rule (K_B) must be present.
    expect(content).toContain("K_B");

    // (c) User store referenced only by the fragment must be preserved.
    expect(content).toContain("store(opaqueStore)");

    // (d) The fragment itself must appear in the output.
    expect(content).toContain("save(opaqueStore, 1)");

    // (e) Fragment (sourceLine 25) must appear before the surviving rule (sourceLine 35).
    const fragIdx = content.indexOf("save(opaqueStore, 1)");
    const ruleIdx = content.indexOf("K_B");
    expect(fragIdx).toBeLessThan(ruleIdx);
  });

  // (g) baseIr must not be mutated by the projection.
  it("does not mutate baseIr when projecting a fragment-bearing keyboard", () => {
    const rule0 = makeRule("rule#0", "K_A", "a");
    const entryGroup = makeGroup("group#main", "main", [rule0]);
    const ir = makeTestIR([entryGroup]);
    ir.raw.push({
      nodeId: "raw#frag",
      origin: "imported" as const,
      sourceText: "c OPAQUE",
      reason: "call/return",
      groupNodeId: "group#main",
    });
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

    // raw array is unchanged.
    expect(ir.raw.length).toBe(1);
    expect(ir.raw[0]?.nodeId).toBe("raw#frag");
    // groups are unchanged.
    expect(ir.groups[0]?.rules.length).toBe(1);
  });
});
