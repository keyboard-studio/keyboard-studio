// Tests for workingCopyStore (keyedit group) — split from workingCopyStore.test.ts by behaviour.
// See workingCopyStore.instantiate.test.ts for the original coverage overview.

import { describe, it, expect } from "vitest";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { RemovalCapability } from "@keyboard-studio/contracts";

// touchAssignments store slot removed — output uses touchLayoutJson (serializeWorkingCopy.ts).
// The recordTouchAssignments action was removed in the gallery-dedup refactor.

// ---------------------------------------------------------------------------
// removalCapabilities — computed once at instantiate, preserved across carve edits
// ---------------------------------------------------------------------------

describe("workingCopyStore — removalCapabilities slot", () => {
  it("starts as an empty Map", () => {
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("instantiateFromBase sets removalCapabilities from opts", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([
      ["rule#1", "removable:simple"],
      ["store#dkt", "removable:slot-fill"],
    ]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir, removalCapabilities: caps });
    const s = useWorkingCopyStore.getState();
    expect(s.removalCapabilities).toBe(caps);
    expect(s.removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("instantiateFromBase defaults to empty Map when removalCapabilities not provided", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("instantiateFromExisting sets removalCapabilities from opts", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([
      ["rule#2", "not-removable:context-sensitive"],
    ]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir, removalCapabilities: caps });
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#2")).toBe("not-removable:context-sensitive");
  });

  it("instantiateFromExisting defaults to empty Map when removalCapabilities not provided (Track 2)", () => {
    // Mirror of the Track 1 (instantiateFromStart) default-empty test.
    // When the import path can't classify (e.g. parse failure), the working copy
    // must still initialise cleanly with an empty map rather than crashing.
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("setIR does NOT clear removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir, removalCapabilities: caps });

    // Simulate a carve edit that calls setIR with a mutated IR.
    const newIr = makeTestIR([]);
    useWorkingCopyStore.getState().setIR(newIr);

    // removalCapabilities must survive — it derives from startIr, not carve IR.
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("deleteItem (carve deletion) preserves removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir, removalCapabilities: caps });

    useWorkingCopyStore.getState().deleteItem("rule#1");

    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });

  it("reset clears removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir, removalCapabilities: caps });
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(1);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().removalCapabilities.size).toBe(0);
  });

  it("idempotent instantiateFromBase (same base id) preserves removalCapabilities", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    const caps = new Map<string, RemovalCapability>([["rule#1", "removable:simple"]]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir, removalCapabilities: caps });

    // Second call with same base id — idempotence guard fires, no overwrite.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    // Capabilities from the first call must still be intact.
    expect(useWorkingCopyStore.getState().removalCapabilities.get("rule#1")).toBe("removable:simple");
  });
});

// ---------------------------------------------------------------------------
// #523 — deleteItem/restoreItem/isItemDeleted round-trip with a chip-format
// id ("<storeNodeId>#<itemsIndex>"). deleteItem/restoreItem are id-agnostic
// (any string works, including the store-slot id shape), so this is a
// regression guard that the per-character store chip toggle path reuses the
// SAME infra as glyph-level carving without any special-casing.
// ---------------------------------------------------------------------------

describe("workingCopyStore — deleteItem/restoreItem round-trip with a chip-format id", () => {
  it("deleteItem then restoreItem with a chip id clears isItemDeleted and pops the undo entry", () => {
    const chipId = "store#dktX#1";

    useWorkingCopyStore.getState().deleteItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "i", id: chipId }]);

    useWorkingCopyStore.getState().restoreItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("undoDelete pops a chip-id deletion off the stack the same as any other item id", () => {
    const chipId = "store#dktX#2";

    useWorkingCopyStore.getState().deleteItem(chipId);
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(true);

    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isItemDeleted(chipId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteTouchKey/restoreTouchKey/isTouchKeyDeleted — the touch-method deletion
// overlay (separate id space + undo channel from deletedItemIds/deleteItem).
// ---------------------------------------------------------------------------

describe("workingCopyStore — deleteTouchKey/restoreTouchKey round-trip", () => {
  it("deleteTouchKey marks the address deleted and pushes a 't' undo entry", () => {
    const touchId = "phone:default:U_0061:sk:U_00E1";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "t", id: touchId }]);
  });

  it("restoreTouchKey clears the address and pops its undo entry", () => {
    const touchId = "phone:default:U_0061";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    useWorkingCopyStore.getState().restoreTouchKey(touchId);

    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("undoDelete reverses the most recent touch-key deletion", () => {
    const touchId = "phone:default:U_0062";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);

    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(false);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it("touch-key deletions and item deletions occupy separate id spaces and undo independently", () => {
    const touchId = "phone:default:U_0063";
    const itemId = "phone:default:U_0063"; // same literal string, different channel

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    useWorkingCopyStore.getState().deleteItem(itemId);

    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
    expect(useWorkingCopyStore.getState().isItemDeleted(itemId)).toBe(true);

    // Undo pops the most recent entry (the item deletion) without touching
    // the touch-key deletion.
    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().isItemDeleted(itemId)).toBe(false);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted(touchId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// keepAll/restoreAll must account for deletedTouchKeyIds — regression for the
// bug where a pending 't' undo entry was orphaned (undoStack wiped while
// deletedTouchKeyIds stayed applied) by a carve keepAll/restoreAll. Both
// actions restore the invariant: after either call, undoStack is empty AND
// deletedNodeIds/deletedItemIds/deletedTouchKeyIds are all empty — no
// deletion of any kind can outlive the undo history that was its only path
// back. See the keepAll implementation comment in workingCopyStore.ts.
// ---------------------------------------------------------------------------

describe("workingCopyStore — keepAll/restoreAll clear deletedTouchKeyIds", () => {
  it("deleteTouchKey then restoreAll clears deletedTouchKeyIds and undoStack", () => {
    const touchId = "phone:default:U_0064";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(1);

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.isTouchKeyDeleted(touchId)).toBe(false);
    expect(s.undoStack).toHaveLength(0);
  });

  it("deleteTouchKey then keepAll leaves no orphaned 't' undo entry and no applied touch deletion", () => {
    const touchId = "phone:default:U_0065";

    useWorkingCopyStore.getState().deleteTouchKey(touchId);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: "t", id: touchId }]);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    // The undo stack is wiped by keepAll — so deletedTouchKeyIds must be wiped
    // in the same call, or this 't' entry's deletion would be permanently
    // un-undoable while still applied (the orphan this test locks).
    expect(s.undoStack).toHaveLength(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.isTouchKeyDeleted(touchId)).toBe(false);
  });

  it("mixed carve (node + item) and touch deletions: keepAll leaves all three deletion Sets and undoStack empty", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().deleteItem("n2#0");
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:U_0066");

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(3);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });

  it("mixed carve (node + item) and touch deletions: restoreAll leaves all three deletion Sets and undoStack empty", () => {
    useWorkingCopyStore.getState().deleteNode("n1");
    useWorkingCopyStore.getState().deleteItem("n2#0");
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:U_0067");

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(3);

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.deletedTouchKeyIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// spec 063 T056/T057 — keyEditOverlay: commitKeyEdit/undoKeyEdit, plus (T057)
// their integration with the shared chronological undoStack: commitKeyEdit
// pushes a 'k' UndoEntry, undoDelete has a 'k' branch, undoKeyEdit filters the
// matching entry out of undoStack (the restore-side filter), and keepAll
// clears keyEditOverlay alongside the other deletion state (FR-032).
// ---------------------------------------------------------------------------

describe("workingCopyStore — keyEditOverlay", () => {
  it("starts as an empty ordered log", () => {
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("commitKeyEdit appends an op, assigning seq = the current op count", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_B",
      kind: "rename",
      toId: "K_C",
    });

    const ops = useWorkingCopyStore.getState().keyEditOverlay.ops;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ seq: 0, address: "phone:default:K_A", kind: "suppress" });
    expect(ops[1]).toMatchObject({ seq: 1, address: "phone:default:K_B", kind: "rename" });
  });

  it("undoKeyEdit removes only the most recently committed op", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_B",
      kind: "rename",
      toId: "K_C",
    });

    useWorkingCopyStore.getState().undoKeyEdit();

    const ops = useWorkingCopyStore.getState().keyEditOverlay.ops;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ address: "phone:default:K_A", kind: "suppress" });
  });

  it("undoKeyEdit on an empty overlay is a no-op", () => {
    useWorkingCopyStore.getState().undoKeyEdit();
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("reset clears keyEditOverlay back to an empty log", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("instantiateFromBase clears keyEditOverlay on a genuine base switch", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    // A different base id forces the genuine-switch path (resolveInstantiationCase).
    const otherStart = { ...basicKbdus, id: "some_other_base" };
    useWorkingCopyStore.getState().instantiateFromStart(otherStart, { vfs, ir });
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });

  it("instantiateFromExisting clears keyEditOverlay on a genuine base switch", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);

    const otherKeyboard = { ...basicKbdus, id: "some_other_keyboard" };
    useWorkingCopyStore.getState().instantiateFromExisting(otherKeyboard, { vfs, ir });
    expect(useWorkingCopyStore.getState().keyEditOverlay).toEqual({ ops: [] });
  });
});

// ---------------------------------------------------------------------------
// spec 063 T057 — key edits on the shared chronological undoStack.
// ---------------------------------------------------------------------------

describe("workingCopyStore — key edit undo integration (T057, FR-032)", () => {
  it("commitKeyEdit pushes a 'k' UndoEntry with the committed op's seq", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    const s = useWorkingCopyStore.getState();
    expect(s.undoStack).toEqual([{ k: "k", seq: 0 }]);
  });

  it("undoDelete pops a 'k' entry and removes the matching op from keyEditOverlay", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_B",
      kind: "rename",
      toId: "K_C",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(2);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(2);

    useWorkingCopyStore.getState().undoDelete();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(1);
    expect(s.keyEditOverlay.ops[0]).toMatchObject({ address: "phone:default:K_A", kind: "suppress" });
    expect(s.undoStack).toHaveLength(1);
    expect(s.undoStack[0]).toEqual({ k: "k", seq: 0 });
  });

  it("undoDelete interleaves correctly: a node delete and a key edit are each other's independent undo entries", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    // Last entry is the key edit — undoDelete should reverse it, not the node.
    useWorkingCopyStore.getState().undoDelete();
    let s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(0);
    expect(s.isDeleted("node-1")).toBe(true);

    // Now the node delete is last — undoDelete reverses that.
    useWorkingCopyStore.getState().undoDelete();
    s = useWorkingCopyStore.getState();
    expect(s.isDeleted("node-1")).toBe(false);
  });

  it("undoKeyEdit (the restore-side filter) removes the matching 'k' entry from undoStack even when it is not the stack's tail", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    // A node delete lands on the stack AFTER the key edit, so the 'k' entry is
    // no longer the tail.
    useWorkingCopyStore.getState().deleteNode("node-1");
    expect(useWorkingCopyStore.getState().undoStack).toEqual([
      { k: "k", seq: 0 },
      { k: "n", id: "node-1" },
    ]);

    useWorkingCopyStore.getState().undoKeyEdit();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay.ops).toHaveLength(0);
    // The matching 'k' entry is gone; the unrelated 'n' entry is untouched.
    expect(s.undoStack).toEqual([{ k: "n", id: "node-1" }]);
    expect(s.isDeleted("node-1")).toBe(true);
  });

  it("undoKeyEdit on an empty overlay does not touch undoStack", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().undoKeyEdit();

    const s = useWorkingCopyStore.getState();
    expect(s.undoStack).toEqual([{ k: "n", id: "node-1" }]);
  });

  it("keepAll clears keyEditOverlay along with the deletion sets and undoStack", () => {
    useWorkingCopyStore.getState().deleteNode("node-1");
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(2);

    useWorkingCopyStore.getState().keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay).toEqual({ ops: [] });
    expect(s.undoStack).toEqual([]);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.isDeleted("node-1")).toBe(false);
  });

  it("restoreAll (alias for keepAll) also clears keyEditOverlay", () => {
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    useWorkingCopyStore.getState().restoreAll();

    const s = useWorkingCopyStore.getState();
    expect(s.keyEditOverlay).toEqual({ ops: [] });
    expect(s.undoStack).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// spec 063 T056 — touchEditorMode: setTouchEditorMode.
// ---------------------------------------------------------------------------

describe("workingCopyStore — touchEditorMode", () => {
  it("defaults to 'character' (the character walk is the default per FR-036)", () => {
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });

  it("setTouchEditorMode switches to 'key' and back", () => {
    useWorkingCopyStore.getState().setTouchEditorMode("key");
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("key");

    useWorkingCopyStore.getState().setTouchEditorMode("character");
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });

  it("toggling mode does NOT clear touchDraft or keyEditOverlay (FR-036b)", () => {
    useWorkingCopyStore.getState().setTouchDraft({ charTouchEntries: [], suggestionResolvedChars: ["a"] });
    useWorkingCopyStore.getState().commitKeyEdit({
      address: "phone:default:K_A",
      kind: "suppress",
      spClass: 9,
      sentinelId: "T_none",
    });

    useWorkingCopyStore.getState().setTouchEditorMode("key");

    const s = useWorkingCopyStore.getState();
    expect(s.touchDraft).toEqual({ charTouchEntries: [], suggestionResolvedChars: ["a"] });
    expect(s.keyEditOverlay.ops).toHaveLength(1);
  });

  it("reset restores touchEditorMode to 'character'", () => {
    useWorkingCopyStore.getState().setTouchEditorMode("key");
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().touchEditorMode).toBe("character");
  });
});