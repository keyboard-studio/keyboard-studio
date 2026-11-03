// Tests for workingCopyStore (carve group) — split from workingCopyStore.test.ts by behaviour.
// See workingCopyStore.instantiate.test.ts for the original coverage overview.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { getCharacterInventoryValue, inventoryOps, resetInventoryDecisions, resetInventoryDraft } from "../survey/useInventoryDraft.ts";
import { makeTestIR, makeCharStore, irGroup, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { makeTouchKeyRuleJoinFixture, TOUCH_JOIN_IDS } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import { snapshotWorkingCopyToSession, rehydrateWorkingCopyFromSession } from "../lib/persistWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Per-working-copy Phase B proposal decisions (spec 044 FR-016a)
//
// `rejected` and `exemplarMethodDeclined` deliberately survive
// the inventory draft's own reset() — that runs on every entry to the build-list
// screen, and clearing them there would re-propose characters the author just
// removed. They are per-WORKING-COPY, so the two instantiate entry points
// clear them instead. Without that wiring the decisions were effectively
// per-browser-session: declining on keyboard A silently pre-declined keyboard
// B, and a character rejected in A was suppressed from B's proposal.
// ---------------------------------------------------------------------------

describe("workingCopyStore — Phase B proposal decisions are per-working-copy", () => {
  const BM_INVENTORY: SourcedInventory = {
    resolvedTag: "bm",
    source: "cldr",
    confidence: "approved",
    characters: [{ char: "ɔ", tier: "main", source: "cldr", confidence: "approved" }],
    digraphs: [],
  };

  afterEach(() => {
    resetInventoryDecisions();
  });

  /** Seed a proposal, reject one of its characters, and decline the offer. */
  function declineAndReject(): void {
    inventoryOps("characters").seedFromProposal(BM_INVENTORY, "bm");
    inventoryOps("characters").remove("ɔ");
    inventoryOps("characters").declineExemplarMethod();
    expect(getCharacterInventoryValue().rejected).toContain("ɔ");
    expect(getCharacterInventoryValue().exemplarMethodDeclined).toBe(true);
  }

  it("instantiateFromBase clears them for a new working copy", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    // Keyboard B, started in the same browser session.
    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromStart(keyboardB, { vfs, ir: makeTestIR([]) });

    expect(getCharacterInventoryValue().rejected).toEqual([]);
    expect(getCharacterInventoryValue().exemplarMethodDeclined).toBe(false);
  });

  it("instantiateFromExisting clears them for a new working copy", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromExisting(keyboardB, { vfs, ir: makeTestIR([]) });

    expect(getCharacterInventoryValue().rejected).toEqual([]);
    expect(getCharacterInventoryValue().exemplarMethodDeclined).toBe(false);
  });

  it("a character rejected on keyboard A is proposed normally on keyboard B", () => {
    const vfs = createVirtualFS();
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
    declineAndReject();

    const keyboardB = { ...basicKbdus, id: "keyboard_b" };
    useWorkingCopyStore.getState().instantiateFromStart(keyboardB, { vfs, ir: makeTestIR([]) });
    // Entering B's build-list screen: the per-visit reset, then a fresh seed.
    resetInventoryDraft();
    inventoryOps("characters").seedFromProposal(BM_INVENTORY, "bm");

    expect(getCharacterInventoryValue().chars).toContain("ɔ");
    expect(getCharacterInventoryValue().provenance["ɔ"]).toBe("cldr");
  });

  it("a redundant re-fire of the SAME instantiate does not discard a live decision", () => {
    const vfs = createVirtualFS();
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
    declineAndReject();

    // Case 1 of resolveInstantiationCase: same id AND same mode -> full no-op.
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });

    expect(getCharacterInventoryValue().rejected).toContain("ɔ");
    expect(getCharacterInventoryValue().exemplarMethodDeclined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// commitTouchKeyRename — the T091 complete reference fix-up (spec 063;
// key-id-policy.md §4; touch-key-rule-join.md §6.1's final bullet). Reuses
// the shared touch-key<->rule-join fixture (contract §8, "no second
// fixture") rather than a bespoke one, mirroring AssignPanel.test.tsx's own
// precedent for the same fixture in this package.
// ---------------------------------------------------------------------------

describe("workingCopyStore — commitTouchKeyRename (spec 063 T091)", () => {
  it("returns changed:false and touches nothing when there is no working IR yet", () => {
    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result).toEqual({ changed: false, renamedRuleNodeIds: [], renamedAddresses: [] });
  });

  it("writes the renamed ir via the overlay-preserving setWorkingIR seam, preserving the carve-deletion overlay", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteNode("unrelated-carve-node");
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("unrelated-carve-node")).toBe(true);

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.changed).toBe(true);
    expect([...result.renamedRuleNodeIds].sort()).toEqual(["rule#mark", "rule#mark-guard"].sort());

    const after = useWorkingCopyStore.getState();
    // A carve-side deletion made through a DIFFERENT overlay survives —
    // setWorkingIR, not setIR, is the seam this action must use.
    expect(after.deletedNodeIds.has("unrelated-carve-node")).toBe(true);

    const phoneKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "phone")!.layers[0]!.rows[0]!.keys[0]!;
    const tabletKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "tablet")!.layers[0]!.rows[0]!.keys[0]!;
    expect(phoneKey.id).toBe("T_0300RENAMED");
    expect(tabletKey.id).toBe("T_0300RENAMED");
  });

  it("remaps a deleted-touch-key address through the EXISTING restore/delete actions, keeping undo entries consistent (FR-028, FR-033)", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const oldAddress = "phone:default:T_0300";
    const newAddress = "phone:default:T_0300RENAMED";
    useWorkingCopyStore.getState().deleteTouchKey(oldAddress);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.has(oldAddress)).toBe(true);
    expect(
      useWorkingCopyStore.getState().undoStack.some((e) => e.k === "t" && e.id === oldAddress),
    ).toBe(true);

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.renamedAddresses).toEqual(
      expect.arrayContaining([{ oldAddress, newAddress }]),
    );

    const after = useWorkingCopyStore.getState();
    // The stale (pre-rename) address no longer resolves to a deletion...
    expect(after.deletedTouchKeyIds.has(oldAddress)).toBe(false);
    // ...it moved to the renamed key's new address instead of silently
    // vanishing (touchKeyAddress.ts: a stale address here would be data
    // loss, not the carve cascade's desirable idempotence).
    expect(after.deletedTouchKeyIds.has(newAddress)).toBe(true);
    // The tablet platform's occurrence of T_0300 was never deleted, so it is
    // not spuriously added to the overlay by the remap.
    expect(after.deletedTouchKeyIds.size).toBe(1);
    // Undo stack: no stale 't' entry for the old address, exactly one for the new.
    expect(after.undoStack.some((e) => e.k === "t" && e.id === oldAddress)).toBe(false);
    expect(after.undoStack.filter((e) => e.k === "t" && e.id === newAddress)).toHaveLength(1);
  });

  it("leaves a deletion overlay untouched when nothing in it matches the renamed key", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:T_FCFA");

    useWorkingCopyStore.getState().commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    const after = useWorkingCopyStore.getState();
    expect(after.deletedTouchKeyIds.has("phone:default:T_FCFA")).toBe(true);
    expect(after.deletedTouchKeyIds.size).toBe(1);
  });

  it("promotes every renamed occurrence to hand-set provenance at its NEW address (T059, address-matched — never id-matched)", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename(TOUCH_JOIN_IDS.mark, "T_0300RENAMED");
    expect(result.changed).toBe(true);

    const after = useWorkingCopyStore.getState();
    const phoneKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "phone")!.layers[0]!.rows[0]!.keys[0]!;
    const tabletKey = after.ir!.touchLayout!.platforms.find((p) => p.id === "tablet")!.layers[0]!.rows[0]!.keys[0]!;
    expect(phoneKey.id).toBe("T_0300RENAMED");
    expect(phoneKey.provenance).toBe("hand-set");
    expect(tabletKey.id).toBe("T_0300RENAMED");
    expect(tabletKey.provenance).toBe("hand-set");
  });

  it("is a no-op end to end (no ir write, no overlay remap) when fromKeyId matches nothing", () => {
    useWorkingCopyStore.getState().setIR(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    useWorkingCopyStore.getState().deleteTouchKey("phone:default:T_0300");
    const before = useWorkingCopyStore.getState();

    const result = useWorkingCopyStore
      .getState()
      .commitTouchKeyRename("T_DOES_NOT_EXIST", "T_WHATEVER");

    expect(result).toEqual({ changed: false, renamedRuleNodeIds: [], renamedAddresses: [] });
    const after = useWorkingCopyStore.getState();
    expect(after.ir).toBe(before.ir);
    expect(after.deletedTouchKeyIds).toEqual(before.deletedTouchKeyIds);
    expect(after.undoStack).toEqual(before.undoStack);
  });
});

// ---------------------------------------------------------------------------
// Carve overlay mutators never mutate the IR in place (spec 014 T011, AC US1-2 /
// SC-001). Carve edits are an overlay (deletedNodeIds / deletedItemIds)
// projected onto the IR only at serialization; the single executed IR write
// path is the reducer's mutate() apply.
// ---------------------------------------------------------------------------

describe("workingCopyStore — carve overlay mutators never mutate the IR in place", () => {
  function carveIR(): KeyboardIR {
    return makeTestIR([], [makeCharStore("s0", "letters", "abc"), makeCharStore("s1", "extra", "de")]);
  }

  it("deleteNode records an overlay and leaves the seeded IR byte-identical", () => {
    const ir = carveIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteNode("s0");

    expect(useWorkingCopyStore.getState().deletedNodeIds.has("s0")).toBe(true);
    expect(ir).toEqual(snapshot);
    expect(useWorkingCopyStore.getState().ir).toEqual(snapshot);
  });

  it("deleteItem records an overlay and does not touch the IR's stores", () => {
    const ir = carveIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteItem("s0#0");

    expect(useWorkingCopyStore.getState().deletedItemIds.has("s0#0")).toBe(true);
    expect(ir.stores).toEqual(snapshot.stores);
  });

  it("keepAll clears the overlay without ever having written the IR", () => {
    const ir = carveIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteNode("s0");
    store.deleteItem("s1#0");
    store.keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.ir).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// spec 062 US3 (T019): `contextToleranceWriteBack` (a plain optional field on
// `DiscoveryAxisVector`) needs no new persistence wiring — it rides `irAxes`'s
// generic passthrough in persistWorkingCopy.ts's snapshot/rehydrate, the
// sessionStorage cycle draftPersistence.ts uses across an OAuth redirect.
// ---------------------------------------------------------------------------

describe("workingCopyStore — contextToleranceWriteBack persistence (spec 062 T019)", () => {
  function instantiate(): void {
    useWorkingCopyStore.getState().instantiateFromStart(
      { id: "kbd", displayName: "Kbd", languages: [] } as unknown as StartKeyboard,
      { vfs: createVirtualFS([]), ir: makeTestIR([]) },
    );
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("survives a sessionStorage snapshot/rehydrate round-trip (no new wiring needed)", () => {
    instantiate();
    useWorkingCopyStore.getState().setIrAxes({ contextToleranceWriteBack: "own-form" });
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBe("own-form");

    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBeUndefined();

    expect(rehydrateWorkingCopyFromSession()).toBe(true);
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBe("own-form");
  });

  it("a snapshot predating this field rehydrates with the field absent (defaults to echo per FR-007)", () => {
    instantiate();
    // No contextToleranceWriteBack ever set, exactly as a pre-spec-062 draft.
    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();

    expect(rehydrateWorkingCopyFromSession()).toBe(true);
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// carveChars — issue #1809 ruling §1: the aggregated carved character set.
// The projection runs ONE aggregated-R pass over this set and unions it with
// the incremental deletedItemIds union, because the per-character union is
// not equivalent to the aggregated pass for whole-rule "no rows left"
// deletion and fully-tainted literal outputs.
// ---------------------------------------------------------------------------

describe("workingCopyStore — carveChars (issue #1809, ruling §1)", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
  });

  it("starts empty", () => {
    expect(useWorkingCopyStore.getState().carveChars.size).toBe(0);
  });

  it("cascadeDelete records carvedChars; cascadeRestore removes them", () => {
    const s = () => useWorkingCopyStore.getState();
    s().cascadeDelete(["rule#1"], ["store#s#0"], ["ä"]);
    expect(s().carveChars).toEqual(new Set(["ä"]));
    expect(s().isItemDeleted("rule#1")).toBe(true);

    s().cascadeDelete(["rule#2"], [], ["ö"]);
    expect(s().carveChars).toEqual(new Set(["ä", "ö"]));

    s().cascadeRestore(["rule#1", "store#s#0"], ["ä"]);
    expect(s().carveChars).toEqual(new Set(["ö"]));
    expect(s().isItemDeleted("rule#1")).toBe(false);
    // ö's deletion survives the partial restore.
    expect(s().isItemDeleted("rule#2")).toBe(true);
  });

  it("cascadeDelete without carvedChars leaves carveChars untouched (non-carve path)", () => {
    const s = () => useWorkingCopyStore.getState();
    // MechanismGallery's remove-existing-method path passes no chars.
    s().cascadeDelete(["rule#1"], []);
    expect(s().carveChars.size).toBe(0);
    expect(s().isItemDeleted("rule#1")).toBe(true);
    expect(s().undoStack).toEqual([
      { k: "batch", nodeIds: [], itemIds: ["rule#1"], chars: [] },
    ]);
  });

  it("undoDelete unwinds the batch's chars but keeps chars claimed by remaining batches", () => {
    const s = () => useWorkingCopyStore.getState();
    s().cascadeDelete(["rule#a"], [], ["a"]);
    // A group toggle that re-carves an already-discarded cell: the same char
    // ends up claimed by two batches.
    s().cascadeDelete(["rule#a", "rule#b"], [], ["a", "b"]);
    expect(s().carveChars).toEqual(new Set(["a", "b"]));

    s().undoDelete(); // undo the group batch
    // 'a' survives: the first batch still claims it.
    expect(s().carveChars).toEqual(new Set(["a"]));

    s().undoDelete();
    expect(s().carveChars.size).toBe(0);
  });

  it("keepAll clears carveChars along with the id union and undo stack", () => {
    const s = () => useWorkingCopyStore.getState();
    s().cascadeDelete(["rule#1"], [], ["ä"]);
    expect(s().carveChars.size).toBe(1);
    s().keepAll();
    expect(s().carveChars.size).toBe(0);
    expect(s().deletedItemIds.size).toBe(0);
    expect(s().undoStack).toHaveLength(0);
  });

  it("carveChars survives the persist snapshot round-trip", async () => {
    const { snapshotWorkingCopyData, prepareWorkingCopySnapshot } = await import(
      "../lib/persistWorkingCopy.ts"
    );
    const s = () => useWorkingCopyStore.getState();
    s().cascadeDelete(["rule#1"], [], ["ä", "ö"]);

    const snapshot = snapshotWorkingCopyData();
    expect(snapshot.carveChars).toEqual(["ä", "ö"]);

    s().reset();
    expect(s().carveChars.size).toBe(0);

    useWorkingCopyStore.setState(prepareWorkingCopySnapshot(snapshot));
    expect(useWorkingCopyStore.getState().carveChars).toEqual(new Set(["ä", "ö"]));
  });

  it("prepareWorkingCopySnapshot tolerates snapshots saved before carveChars existed", async () => {
    const { prepareWorkingCopySnapshot, snapshotWorkingCopyData } = await import(
      "../lib/persistWorkingCopy.ts"
    );
    const snapshot = snapshotWorkingCopyData();
    delete (snapshot as { carveChars?: string[] }).carveChars;
    const partial = prepareWorkingCopySnapshot(snapshot);
    expect(partial.carveChars).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// A7a remap-posture derivation (spec §7.2 rule 8) — the derived baseline
// lands on irAxes when the target identity lands, via
// syncRemapPostureFromIdentity, and a recorded phase answer outranks it.
// ---------------------------------------------------------------------------

describe("workingCopyStore — syncRemapPostureFromIdentity (A7a)", () => {
  const latinLetterIr = () =>
    makeTestIR([
      irGroup({
        rules: [
          vkeyRule({ vkey: "K_A", output: "a" }),
          vkeyRule({ vkey: "K_B", output: "b" }),
          vkeyRule({ vkey: "K_C", output: "c" }),
        ],
      }),
    ]);

  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
    useWorkingCopyStore
      .getState()
      .instantiateFromStart(basicKbdus, { vfs: createVirtualFS(), ir: latinLetterIr() });
  });

  it("seeds remapPosture=full-remap onto irAxes and the session when the derivation fires", () => {
    useWorkingCopyStore
      .getState()
      .syncRemapPostureFromIdentity({ scriptClass: "alphabetic", targetScript: "Cyrl" });
    const s = useWorkingCopyStore.getState();
    expect(s.irAxes.remapPosture).toBe("full-remap");
    expect(s.session.axes.remapPosture).toBe("full-remap");
  });

  it("leaves irAxes untouched for a Latin target (the guardrail)", () => {
    useWorkingCopyStore
      .getState()
      .syncRemapPostureFromIdentity({ scriptClass: "alphabetic", targetScript: "Latn" });
    expect(useWorkingCopyStore.getState().irAxes.remapPosture).toBeUndefined();
  });

  it("leaves irAxes untouched for a non-alphabetic script class", () => {
    useWorkingCopyStore
      .getState()
      .syncRemapPostureFromIdentity({ scriptClass: "abugida", targetScript: "Cyrl" });
    expect(useWorkingCopyStore.getState().irAxes.remapPosture).toBeUndefined();
  });

  it("clears a previously derived posture when the target changes to a Latin script", () => {
    const store = useWorkingCopyStore.getState();
    store.syncRemapPostureFromIdentity({ scriptClass: "alphabetic", targetScript: "Armn" });
    expect(useWorkingCopyStore.getState().irAxes.remapPosture).toBe("full-remap");
    store.syncRemapPostureFromIdentity({ scriptClass: "alphabetic", targetScript: "Latn" });
    const s = useWorkingCopyStore.getState();
    expect(s.irAxes.remapPosture).toBeUndefined();
    expect(s.session.axes.remapPosture).toBeUndefined();
  });

  it("a recorded tier-1 phase answer outranks the derived baseline", () => {
    const store = useWorkingCopyStore.getState();
    store.syncRemapPostureFromIdentity({ scriptClass: "alphabetic", targetScript: "Cyrl" });
    store.recordPhase({
      phase: "B",
      answers: [],
      computedAxes: { remapPosture: "addition" },
    });
    const s = useWorkingCopyStore.getState();
    expect(s.irAxes.remapPosture).toBe("full-remap");
    expect(s.session.axes.remapPosture).toBe("addition");
  });
});
