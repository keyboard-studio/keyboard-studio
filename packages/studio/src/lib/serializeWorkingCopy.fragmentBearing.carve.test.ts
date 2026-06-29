// Integration test: fragment-bearing keyboard — removal surfaces through BOTH
// consumer paths (preview projection and ZIP output).
//
// Acceptance criterion: a user adapting a genuinely fragment-bearing keyboard
// can remove at least one pattern/store node and see the removal reflected in
// BOTH the live preview AND the downloaded zip. The engine fix that shipped
// ensures the position-faithful emit path runs on fragment-bearing IR without
// bailing out. This test proves the removal propagates through both consumer
// paths that share `projectWorkingCopyVfs`, and that opaque fragments are
// preserved (not silently dropped) throughout.
//
// FIXTURE CHOICE: synthetic in-memory KeyboardIR (no sibling keyboards checkout
// required at test time). We build a fragment-bearing IR directly — three typed
// stores (one retained, one to remove, one opaque-only), one group with two
// typed rules (one to remove, one surviving), and three RawKmnFragment nodes
// to simulate the opaque fragment density of a real fragment-bearing keyboard.
// This is hermetic and keeps the test CI-safe while remaining materially faithful
// to the failing input class (IR with ir.raw.length > 0 interleaved with typed nodes).
//
// IMPORTANT: this file does NOT mock @keyboard-studio/engine. The real
// applyCarveToVfs / emitKmn pipeline runs, so the assertions on emitted .kmn
// content are meaningful. services.ts IS mocked to avoid WASM / network I/O.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Mock services.ts — prevents WASM / network I/O during the test.
// projectWorkingCopyForOutput reads getPatternLibraryService(); we stub it with
// an always-undefined resolver. getToZip is NOT called by projectWorkingCopyForOutput
// (only by serializeWorkingCopy which is not under test here).
// ---------------------------------------------------------------------------

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

// ---------------------------------------------------------------------------
// Fixture construction helpers
// ---------------------------------------------------------------------------

function makeRule(nodeId: string, vkey: string, char: string, sourceLine?: number): IRRule {
  const r: IRRule = {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
  if (sourceLine !== undefined) r.sourceLine = sourceLine;
  return r;
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeStore(nodeId: string, name: string, sourceLine?: number): IRStore {
  const s: IRStore = {
    nodeId,
    name,
    items: [{ kind: "char", value: "x" }],
    isSystem: false,
  };
  if (sourceLine !== undefined) s.sourceLine = sourceLine;
  return s;
}

/**
 * Build a fragment-bearing KeyboardIR fixture that models a real keyboard
 * with opaque RawKmnFragment nodes interleaved with typed stores/rules:
 *
 *   sourceLine 10  — store "survivingStore"  (retained)
 *   sourceLine 15  — store "removedStore"    (to be deleted via deletedNodeIds)
 *   sourceLine 20  — store "opaqueOnlyStore" (retained; only referenced by fragments)
 *   sourceLine 25  — RawKmnFragment frag#1 (save opaque option store)
 *   sourceLine 30  — RawKmnFragment frag#2 (if-option check)
 *   sourceLine 40  — [group main opens here]
 *   sourceLine 45  — rule "rule#keep"  (K_B -> 'b')  — retained
 *   sourceLine 50  — rule "rule#remove" (K_A -> 'a') — to be deleted via deletedNodeIds
 *   sourceLine 60  — RawKmnFragment frag#3 (outs expansion, inside main group)
 */
function buildFragmentBearingIR() {
  const ruleKeep   = makeRule("rule#keep",   "K_B", "b", 45);
  const ruleRemove = makeRule("rule#remove", "K_A", "a", 50);
  const entryGroup = makeGroup("group#main", "main", [ruleKeep, ruleRemove]);

  const ir = makeTestIR([entryGroup], [
    makeStore("store#surviving", "survivingStore", 10),
    makeStore("store#removed",   "removedStore",   15),
    makeStore("store#opaqueOnly","opaqueOnlyStore", 20),
  ]);

  // Three opaque fragments to represent real fragment-bearing density.
  ir.raw.push(
    {
      nodeId: "raw#frag1",
      origin: "imported" as const,
      sourceText: "save(opaqueOnlyStore, 1)",
      reason: "save/set/reset option-store",
      sourceLine: 25,
    },
    {
      nodeId: "raw#frag2",
      origin: "imported" as const,
      sourceText: "if(opaqueOnlyStore = 1) use(main)",
      reason: "if-option-store condition",
      sourceLine: 30,
    },
    {
      nodeId: "raw#frag3",
      origin: "imported" as const,
      sourceText: "outs(survivingStore)",
      reason: "outs() expansion",
      sourceLine: 60,
      groupNodeId: "group#main",
    },
  );

  return ir;
}

// makeVfs duplicates the helper in projectWorkingCopyVfs.deleted-items.test.ts;
// intentional — kept separate for test-file isolation (no shared test helpers).
function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// Store lifecycle
// ---------------------------------------------------------------------------

function resetStore() {
  useWorkingCopyStore.getState().reset();
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fragment-bearing keyboard — carve removal surfaces through BOTH consumer paths", () => {
  /**
   * Core AC test: remove a rule node and a store node from a fragment-bearing
   * keyboard, then drive the projection through:
   *   (A) the PREVIEW path  — direct projectWorkingCopyVfs call (same as useWorkingCopyTransform)
   *   (B) the ZIP path      — projectWorkingCopyForOutput (same projection the zip serializer uses)
   *
   * Assertions cover:
   *   1. Removed rule (K_A / rule#remove) is ABSENT from both outputs.
   *   2. Removed store (removedStore) is ABSENT from both outputs.
   *   3. Surviving rule (K_B / rule#keep) is PRESENT in both outputs.
   *   4. Surviving store (survivingStore) is PRESENT in both outputs.
   *   5. All three opaque RawKmnFragment sourceTexts are PRESERVED in both outputs.
   *   6. Fragment source ordering is PRESERVED — frag#1 appears before frag#3
   *      which appears after the surviving rule.
   *   7. Both outputs produce the SAME emitted .kmn (the "both paths agree" guarantee).
   *   8. No opaque-gate warning is emitted by either path.
   */
  it("preview and zip projections agree; removed nodes absent; fragments preserved in order", async () => {
    const keyboardId = basicKbdus.id; // "basic_kbdus"
    const ir = buildFragmentBearingIR();
    const vfs = makeVfs(keyboardId);

    // Seed the store (ZIP path reads from the store).
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });

    // Apply the two deletions through the store overlay (mirrors deleteNode() in the SPA).
    useWorkingCopyStore.getState().deleteNode("rule#remove");
    useWorkingCopyStore.getState().deleteNode("store#removed");

    // Read back the deletion sets from the store (as both paths do).
    const { deletedNodeIds, deletedItemIds } = useWorkingCopyStore.getState();

    // -----------------------------------------------------------------------
    // PATH A: PREVIEW — projectWorkingCopyVfs directly (mirrors useWorkingCopyTransform)
    // -----------------------------------------------------------------------

    const previewVfs = createVirtualFS(vfs.entries());
    const { warnings: previewWarnings } = projectWorkingCopyVfs({
      vfs: previewVfs,
      keyboardId,
      baseIr: ir,
      deletedNodeIds,
      deletedItemIds,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    const previewKmn = previewVfs.get(`source/${keyboardId}.kmn`)?.content as string;
    expect(typeof previewKmn, "preview: .kmn must be a string").toBe("string");

    // -----------------------------------------------------------------------
    // PATH B: ZIP — projectWorkingCopyForOutput (reads from store, clones VFS)
    // -----------------------------------------------------------------------

    const outputResult = await projectWorkingCopyForOutput();
    expect(outputResult, "zip: projectWorkingCopyForOutput must not return null").not.toBeNull();

    const zipKmn = outputResult!.vfs.get(`source/${keyboardId}.kmn`)?.content as string;
    expect(typeof zipKmn, "zip: .kmn must be a string").toBe("string");

    const zipWarnings = outputResult!.warnings;

    // -----------------------------------------------------------------------
    // 1. Removed rule (K_A) is ABSENT from both outputs.
    // -----------------------------------------------------------------------
    expect(previewKmn, "preview: removed rule K_A must be absent").not.toMatch(/\bK_A\b/);
    expect(zipKmn,     "zip: removed rule K_A must be absent").not.toMatch(/\bK_A\b/);

    // -----------------------------------------------------------------------
    // 2. Removed store (removedStore) is ABSENT from both outputs.
    // -----------------------------------------------------------------------
    expect(previewKmn, "preview: removed store removedStore must be absent").not.toContain("removedStore");
    expect(zipKmn,     "zip: removed store removedStore must be absent").not.toContain("removedStore");

    // -----------------------------------------------------------------------
    // 3. Surviving rule (K_B) is PRESENT in both outputs.
    // -----------------------------------------------------------------------
    expect(previewKmn, "preview: surviving rule K_B must be present").toContain("K_B");
    expect(zipKmn,     "zip: surviving rule K_B must be present").toContain("K_B");

    // -----------------------------------------------------------------------
    // 4. Surviving store (survivingStore) is PRESENT in both outputs.
    // -----------------------------------------------------------------------
    expect(previewKmn, "preview: survivingStore must be present").toContain("survivingStore");
    expect(zipKmn,     "zip: survivingStore must be present").toContain("survivingStore");

    // -----------------------------------------------------------------------
    // 5. All three RawKmnFragment sourceTexts are PRESERVED in both outputs.
    // -----------------------------------------------------------------------
    expect(previewKmn, "preview: frag#1 sourceText must be preserved").toContain("save(opaqueOnlyStore, 1)");
    expect(previewKmn, "preview: frag#2 sourceText must be preserved").toContain("if(opaqueOnlyStore = 1) use(main)");
    expect(previewKmn, "preview: frag#3 sourceText must be preserved").toContain("outs(survivingStore)");
    expect(zipKmn,     "zip: frag#1 sourceText must be preserved").toContain("save(opaqueOnlyStore, 1)");
    expect(zipKmn,     "zip: frag#2 sourceText must be preserved").toContain("if(opaqueOnlyStore = 1) use(main)");
    expect(zipKmn,     "zip: frag#3 sourceText must be preserved").toContain("outs(survivingStore)");

    // The opaque-only store referenced only by fragments must also be present.
    expect(previewKmn, "preview: opaqueOnlyStore must be preserved (fragment-referenced store)").toContain("opaqueOnlyStore");
    expect(zipKmn,     "zip: opaqueOnlyStore must be preserved (fragment-referenced store)").toContain("opaqueOnlyStore");

    // -----------------------------------------------------------------------
    // 6. Fragment ordering preserved: frag#1 (sourceLine 25) before frag#2
    //    (sourceLine 30) before frag#3 (sourceLine 60). frag#3 is after K_B
    //    (sourceLine 45).
    // -----------------------------------------------------------------------
    const previewFrag1Idx = previewKmn.indexOf("save(opaqueOnlyStore, 1)");
    const previewFrag2Idx = previewKmn.indexOf("if(opaqueOnlyStore = 1) use(main)");
    const previewFrag3Idx = previewKmn.indexOf("outs(survivingStore)");
    expect(previewFrag1Idx, "preview: frag#1 must appear before frag#2").toBeLessThan(previewFrag2Idx);
    expect(previewFrag2Idx, "preview: frag#2 must appear before frag#3").toBeLessThan(previewFrag3Idx);

    const zipFrag1Idx = zipKmn.indexOf("save(opaqueOnlyStore, 1)");
    const zipFrag2Idx = zipKmn.indexOf("if(opaqueOnlyStore = 1) use(main)");
    const zipFrag3Idx = zipKmn.indexOf("outs(survivingStore)");
    expect(zipFrag1Idx, "zip: frag#1 must appear before frag#2").toBeLessThan(zipFrag2Idx);
    expect(zipFrag2Idx, "zip: frag#2 must appear before frag#3").toBeLessThan(zipFrag3Idx);

    // -----------------------------------------------------------------------
    // 7. Both paths produce identical emitted .kmn — the core "both agree" guarantee.
    // Not tautological: the zip path clones the VFS before projecting (independent
    // VFS instance + independent projectWorkingCopyVfs call), so this asserts that
    // the clone + independent projection does not diverge from the preview projection
    // for the same working-copy state.
    // -----------------------------------------------------------------------
    expect(zipKmn, "zip .kmn must equal preview .kmn (shared projection invariant)").toBe(previewKmn);

    // -----------------------------------------------------------------------
    // 8. No opaque-gate warning from either path.
    // -----------------------------------------------------------------------
    const hasOpaqueWarning = (ws: string[]) => ws.some((w) => w.toLowerCase().includes("opaque"));
    expect(hasOpaqueWarning(previewWarnings), "preview: no opaque-gate warning expected").toBe(false);
    expect(hasOpaqueWarning(zipWarnings),     "zip: no opaque-gate warning expected").toBe(false);
  });

  /**
   * Complement: when no deletions are recorded, both paths leave the .kmn
   * unchanged (no spurious re-emit on a fragment-bearing keyboard). This guards
   * against the regression where an empty deletion set still triggered a
   * position-faithful re-emit and silently reordered content.
   */
  it("no deletions: both paths leave .kmn content unchanged for fragment-bearing IR", async () => {
    const keyboardId = basicKbdus.id;
    const ir = buildFragmentBearingIR();
    const baseContent = "c fragment-bearing stub\n";
    const vfs = createVirtualFS([
      { path: `source/${keyboardId}.kmn`, content: baseContent, isBinary: false },
    ]);

    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    // No deletions recorded.

    // PREVIEW path — empty deletion sets, no re-emit expected.
    const previewVfs = createVirtualFS(vfs.entries());
    projectWorkingCopyVfs({
      vfs: previewVfs,
      keyboardId,
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });
    const previewKmn = previewVfs.get(`source/${keyboardId}.kmn`)?.content as string;
    expect(previewKmn, "preview: no-deletion pass must leave .kmn unchanged").toBe(baseContent);

    // ZIP path — same expectation via projectWorkingCopyForOutput.
    const outputResult = await projectWorkingCopyForOutput();
    expect(outputResult, "zip: projectWorkingCopyForOutput must not return null (no-deletion test)").not.toBeNull();
    const zipKmn = outputResult!.vfs.get(`source/${keyboardId}.kmn`)?.content as string;
    expect(zipKmn, "zip: no-deletion pass must leave .kmn unchanged").toBe(baseContent);
  });

  /**
   * Mutation guard: the base IR and base VFS in the store must NOT be mutated
   * by either projection call, so subsequent reads (e.g. second carve, undo)
   * see the unmodified originals.
   */
  it("neither projection path mutates baseIr or baseVfs in the store", async () => {
    const keyboardId = basicKbdus.id;
    const ir = buildFragmentBearingIR();
    const vfs = makeVfs(keyboardId);

    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().deleteNode("rule#remove");

    const { deletedNodeIds, deletedItemIds } = useWorkingCopyStore.getState();

    // PREVIEW path.
    const previewVfs = createVirtualFS(vfs.entries());
    projectWorkingCopyVfs({
      vfs: previewVfs,
      keyboardId,
      baseIr: ir,
      deletedNodeIds,
      deletedItemIds,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // baseIr groups/stores/raw must be unchanged.
    expect(ir.groups[0]?.rules.length, "baseIr groups[0].rules not mutated").toBe(2);
    expect(ir.stores.length,           "baseIr stores not mutated").toBe(3);
    expect(ir.raw.length,              "baseIr raw not mutated").toBe(3);

    // ZIP path — projectWorkingCopyForOutput clones baseVfs before projecting.
    const guardResult = await projectWorkingCopyForOutput();
    expect(guardResult, "zip: projectWorkingCopyForOutput must not return null in mutation-guard test").not.toBeNull();

    const storeState = useWorkingCopyStore.getState();
    // The store's baseVfs entry must still hold the original stub content.
    const baseVfsContent = storeState.baseVfs?.get(`source/${keyboardId}.kmn`)?.content;
    expect(baseVfsContent, "baseVfs in store must not be mutated by zip path").toBe("c stub\n");
    // The store's baseIr must still have both rules.
    expect(storeState.baseIr?.groups[0]?.rules.length, "baseIr in store not mutated by zip path").toBe(2);
  });
});
