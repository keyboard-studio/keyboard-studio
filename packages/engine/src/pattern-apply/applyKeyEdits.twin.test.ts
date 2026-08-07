/**
 * applyKeyEdits.twin.test — the §5/§10 applier-twin equivalence test
 * (spec 058 T047).
 *
 * The contract (contracts/key-edit-overlay.md §5): "The defence is a test,
 * not discipline." Apply the SAME `KeyEditOperation[]` list — covering every
 * one of the seven `kind`s — through both `applyKeyEditsToLayout` (Case A,
 * the IR applier) and `applyKeyEditsToRawJson` (Case B, the raw-JSON
 * applier), parse Case B's output string with the canonical parser, and
 * compare structurally against Case A's result. The comparison is exact
 * modulo exactly two things, both named by Case A's own module docstring
 * ("Fields Case A drops (read by the T047 twin-equivalence test)"):
 *
 *   1. `nodeId` on every key/sub-entry — `NodeIdMinter` restarts its
 *      per-kind counter on every invocation (R10.5), so ids are
 *      deterministic per call but not comparable across two separate calls,
 *      let alone across the two different appliers' minting strategies.
 *   2. `TouchLayoutIR.nodeIds` (the flat platform:layer:key index) — Case A
 *      does not update it for a newly added key, so it is not comparable
 *      after an `add`.
 *
 * Nothing else is normalized away. An undocumented divergence (e.g. one
 * applier silently dropping an emptied `sk`/`multitap`/`flick` collection
 * while the other leaves an empty placeholder) must fail this test, because
 * a too-generous normalizer defeats the whole point of the task.
 *
 * Both appliers start from the SAME materialized document: the T013 fixture
 * touch layout, emitted to a `.keyman-touch-layout` JSON string once, then
 * (a) parsed back to a `TouchLayoutIR` for Case A's input and (b) fed
 * directly to Case B as the raw string. This is deliberate — building
 * Case A's input straight from the fixture's own hand-built IR (which never
 * went through `emitTouchLayout`/`parseTouchLayoutString`) would make every
 * key's `provenance` field disagree between the two sides for a reason that
 * has nothing to do with either applier's OWN behavior (the canonical
 * parser materializes an absent `provenance` to `"hand-set"` on parse,
 * per FR-009). Routing both sides through the same parse first means that
 * artifact is common to both inputs and cancels out of the comparison,
 * leaving only what the two appliers actually did differently.
 */

import { describe, expect, it } from "vitest";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeTouchKeyRuleJoinLayout, TOUCH_JOIN_IDS } from "@keyboard-studio/contracts/fixtures";
import { emitTouchLayout, parseTouchLayout } from "../codec/parse-touch.js";
import { applyKeyEditsToLayout } from "./applyKeyEditsToLayout.js";
import { applyKeyEditsToRawJson } from "./applyKeyEditsToRawJson.js";
import type { KeyEditOperation } from "./keyEditOps.js";
import { touchKeyAddress } from "./touchKeyAddress.js";
import { computeRowMetrics } from "./rowMetrics.js";

// ---------------------------------------------------------------------------
// The one operation list: every kind, once each, plus one deliberately
// unresolvable op (§10's "warnings/orphaned outcomes agree" obligation).
// ---------------------------------------------------------------------------

const BAD_ADDRESS = touchKeyAddress("phone", "default", "T_DOES_NOT_EXIST_057");

function buildOps(): KeyEditOperation[] {
  return [
    // 1. set — plain field edit on a key with no sub-entries.
    {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.caseTest),
      fields: { text: "X-set", output: "SETOUT" },
    },
    // 2. rename — id change on a `use(other)`-transition key.
    {
      seq: 2,
      kind: "rename",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.transition),
      toId: "T_GO_RENAMED",
    },
    // 3. add — genuine splice (both appliers; see each module's docstring on
    //    the "always splice, never promote a blank placeholder" ruling).
    {
      seq: 3,
      kind: "add",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.frame),
      position: "after",
      key: { id: "T_NEWKEY", text: "New", sp: 0 },
    },
    // 4. remove — "redistribute" outcome (the one geometry-writing path);
    //    the fixture's T_NORULE carries no `width`, so this also exercises
    //    the "nothing to redistribute" no-op branch identically on both
    //    sides (see report: a non-trivial width redistribution is not
    //    reachable from this fixture, since EditableKeyFields admits no
    //    `width` for authors to seed one with).
    {
      seq: 4,
      kind: "remove",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.dead),
      outcome: "redistribute",
    },
    // 5. suppress — one operation, sets spClass + neutralizes the id to a
    //    RESERVED ruleless sentinel (T095/FR-029b: applySuppressSemantics
    //    rejects anything else, so this fixture must use a real one).
    {
      seq: 5,
      kind: "suppress",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.opaque),
      spClass: 9,
      sentinelId: "T_BLANK",
    },
    // 6. setSubKey — edit one of the longpress host's two `sk[]` entries,
    //    leaving the other untouched (does NOT empty the collection).
    {
      seq: 6,
      kind: "setSubKey",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.longpressHost),
      sub: { kind: "sk", id: "U_203D" },
      fields: { text: "‽‽", output: "‽‽" },
    },
    // 7. removeSubKey — remove the longpress host's ONLY `flick` entry,
    //    deliberately emptying that collection: this is the edge case that
    //    exposed the sk/multitap/flick "leaves an empty {}/[] instead of
    //    dropping the field" divergence between the two appliers (see the
    //    accompanying report).
    {
      seq: 7,
      kind: "removeSubKey",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.longpressHost),
      sub: { kind: "flick", id: "n" },
    },
    // 8. Deliberately unresolvable — both appliers must skip it (never
    //    throw) and report it as a first-class, never-silent outcome
    //    (contract §8/§10), even though the two appliers phrase the
    //    diagnostic differently.
    {
      seq: 8,
      kind: "set",
      address: BAD_ADDRESS,
      fields: { text: "unreachable" },
    },
  ];
}

// ---------------------------------------------------------------------------
// Normalization — modulo node ids ONLY (see module docstring above).
// ---------------------------------------------------------------------------

function stripNodeId(key: TouchKeyIR): Record<string, unknown> {
  const { nodeId: _nodeId, sk, multitap, flick, ...rest } = key;
  const stripped: Record<string, unknown> = { ...rest };
  if (sk !== undefined) stripped["sk"] = sk.map(stripNodeId);
  if (multitap !== undefined) stripped["multitap"] = multitap.map(stripNodeId);
  if (flick !== undefined) {
    const strippedFlick: Record<string, unknown> = {};
    for (const [direction, sub] of Object.entries(flick)) {
      if (sub !== undefined) strippedFlick[direction] = stripNodeId(sub);
    }
    stripped["flick"] = strippedFlick;
  }
  return stripped;
}

/**
 * Drop `nodeId` (every key/sub-entry) and the top-level `nodeIds` index —
 * the ONLY two things the contract excuses from the comparison. Everything
 * else — field values, key order, presence/absence of a field — is left
 * exactly as each applier produced it, so an undocumented divergence fails
 * loudly instead of being silently absorbed.
 */
function normalizeForComparison(layout: TouchLayoutIR) {
  return {
    platforms: layout.platforms.map((platform) => ({
      id: platform.id,
      ...(platform.font !== undefined ? { font: platform.font } : {}),
      layers: platform.layers.map((layer) => ({
        id: layer.id,
        rows: layer.rows.map((row) => ({
          keys: row.keys.map(stripNodeId),
        })),
      })),
    })),
    // `nodeIds` deliberately excluded — Case A does not update it for a
    // newly added key (applyKeyEditsToLayout.ts's own module docstring).
  };
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

describe("applyKeyEdits twin equivalence (T047)", () => {
  it("produces structurally identical layouts (modulo node ids) for every operation kind", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const layoutForCaseA = parseTouchLayout(rawJson);
    const ops = buildOps();

    const caseA = applyKeyEditsToLayout(layoutForCaseA, ops);
    const caseB = applyKeyEditsToRawJson(rawJson, ops);
    const caseBAsIR = parseTouchLayout(caseB.json);

    // -- The core equivalence: structurally identical, modulo node ids. ----
    expect(normalizeForComparison(caseA.layout)).toEqual(normalizeForComparison(caseBAsIR));

    // -- Sanity: the comparison above isn't vacuously true because both
    //    sides collapsed to the untouched input (i.e. the ops actually did
    //    something, on both sides). -------------------------------------
    expect(normalizeForComparison(caseA.layout)).not.toEqual(
      normalizeForComparison(layoutForCaseA),
    );

    // -- Resolution-failure parity (§10: "warnings/orphaned outcomes agree
    //    where the contract says they must"). Message text is each
    //    applier's own diagnostic phrasing — not part of the contract — so
    //    compare COUNTS and WHICH operation failed, not exact strings. ----
    expect(caseA.orphaned).toHaveLength(1);
    expect(caseA.orphaned[0]).toMatchObject({ seq: 8, address: BAD_ADDRESS });
    expect(caseA.warnings).toHaveLength(1);
    expect(caseB.warnings).toHaveLength(1);

    // -- The other seven all resolved on both sides: exactly one warning
    //    total (op 8's), not one per op. ----------------------------------
    expect(caseA.warnings[0]).toContain(BAD_ADDRESS);
    expect(caseB.warnings[0]).toContain(BAD_ADDRESS);
  });

  it("agrees on key count after `add` — genuine insertion on both sides, never a blank-placeholder promotion", () => {
    // This is the T046 divergence flagged for arbitration: reusing
    // applyTouchAssignmentsToRawJson's blank-placeholder promotion for `add`
    // would let Case B sometimes NOT grow the row's key count while Case A
    // (which has no promotion concept) always does — exactly the class of
    // drift this whole test exists to catch. RULING: both appliers always
    // splice a new key; placeholder promotion belongs only to the
    // by-character assignment path (`applyTouchAssignmentsToRawJson`), which
    // is a different operation vocabulary (TouchAssignment/mechanisms), not
    // a `KeyEditOperation`. Asserted directly here, not just folded into the
    // structural diff above, because a key-count regression is the one
    // divergence class serious enough to deserve its own named assertion.
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const layoutForCaseA = parseTouchLayout(rawJson);
    const addOp: KeyEditOperation = {
      seq: 1,
      kind: "add",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.frame),
      position: "after",
      key: { id: "T_NEWKEY_COUNT_CHECK", text: "New", sp: 0 },
    };

    const caseA = applyKeyEditsToLayout(layoutForCaseA, [addOp]);
    const caseB = applyKeyEditsToRawJson(rawJson, [addOp]);
    const caseBAsIR = parseTouchLayout(caseB.json);

    const rowKeyCount = (layout: TouchLayoutIR): number => {
      const phone = layout.platforms.find((p) => p.id === "phone");
      const defaultLayer = phone?.layers.find((l) => l.id === "default");
      const row = defaultLayer?.rows.find((r) =>
        r.keys.some((k) => k.id === TOUCH_JOIN_IDS.frame),
      );
      return row?.keys.length ?? -1;
    };

    const beforeCount = rowKeyCount(layoutForCaseA);
    const afterCountA = rowKeyCount(caseA.layout);
    const afterCountB = rowKeyCount(caseBAsIR);

    expect(afterCountA).toBe(beforeCount + 1);
    expect(afterCountB).toBe(beforeCount + 1);
    expect(afterCountA).toBe(afterCountB);
  });

  it("rejects a suppress op with a non-sentinel id identically on both sides (FR-029b)", () => {
    // A suppress op whose sentinelId is NOT one of the reserved ruleless
    // sentinels (RESERVED_SENTINEL_KEY_IDS) must be rejected — not silently
    // applied with an arbitrary id masquerading as "suppressed" — and both
    // appliers must agree: the addressed key is untouched on both sides.
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const layoutForCaseA = parseTouchLayout(rawJson);
    const badSuppressOp: KeyEditOperation = {
      seq: 1,
      kind: "suppress",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.opaque),
      spClass: 9,
      sentinelId: "T_NOT_A_RESERVED_SENTINEL",
    };

    const caseA = applyKeyEditsToLayout(layoutForCaseA, [badSuppressOp]);
    const caseB = applyKeyEditsToRawJson(rawJson, [badSuppressOp]);
    const caseBAsIR = parseTouchLayout(caseB.json);

    // Neither side applies the rejected op — the layout is unchanged.
    expect(normalizeForComparison(caseA.layout)).toEqual(normalizeForComparison(layoutForCaseA));
    expect(normalizeForComparison(caseBAsIR)).toEqual(normalizeForComparison(layoutForCaseA));

    // Both sides report exactly one warning for the rejected op, and it is
    // NOT reported as an address-resolution orphan — it resolved; it was
    // the sentinel that was rejected.
    expect(caseA.orphaned).toEqual([]);
    expect(caseA.warnings).toHaveLength(1);
    expect(caseB.warnings).toHaveLength(1);
    expect(caseA.warnings[0]).toContain("T_NOT_A_RESERVED_SENTINEL");
    expect(caseB.warnings[0]).toContain("T_NOT_A_RESERVED_SENTINEL");
  });
});

// ---------------------------------------------------------------------------
// `move` — spec 061 T028 (FR-020, FR-021)
//
// Its own describe block rather than an eighth entry in `buildOps()`: a move
// changes key POSITIONS, and folding it into the shared list would silently
// re-index every other operation's assertions in that list. The obligation is
// the same though — both appliers, one operation list, structural comparison.
// ---------------------------------------------------------------------------

describe("applyKeyEdits twin equivalence — move (spec 061 T028)", () => {
  /** Both appliers' results for one op list, ready to compare. */
  function runBoth(ops: readonly KeyEditOperation[]) {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const caseA = applyKeyEditsToLayout(before, [...ops]);
    const caseB = applyKeyEditsToRawJson(rawJson, [...ops]);
    return { before, caseA, caseB, caseBAsIR: parseTouchLayout(caseB.json) };
  }

  const phoneDefault = (layout: TouchLayoutIR) =>
    layout.platforms.find((p) => p.id === "phone")!.layers.find((l) => l.id === "default")!;

  /** Every row's key ids, so a positional assertion reads as a list rather than an index. */
  const idGrid = (layout: TouchLayoutIR): string[][] =>
    phoneDefault(layout).rows.map((r) => r.keys.map((k) => k.id));

  function moveOp(keyId: string, direction: "left" | "right" | "up" | "down"): KeyEditOperation {
    return {
      seq: 1,
      kind: "move",
      address: touchKeyAddress("phone", "default", keyId),
      direction,
    };
  }

  /** Where `keyId` sits, as `[rowIndex, keyIndex]`, or `[-1, -1]`. */
  function locate(layout: TouchLayoutIR, keyId: string): [number, number] {
    const grid = idGrid(layout);
    for (let r = 0; r < grid.length; r++) {
      const c = grid[r]!.indexOf(keyId);
      if (c !== -1) return [r, c];
    }
    return [-1, -1];
  }

  it("swaps within the row for `right`, identically on both sides", () => {
    const { before, caseA, caseBAsIR } = runBoth([moveOp(TOUCH_JOIN_IDS.caseTest, "right")]);
    const [row, col] = locate(before, TOUCH_JOIN_IDS.caseTest);
    expect(locate(caseA.layout, TOUCH_JOIN_IDS.caseTest)).toEqual([row, col + 1]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("swaps within the row for `left`, identically on both sides", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    // Pick a key that is NOT first in its row, so `left` has room.
    const grid = idGrid(before);
    const rowIdx = grid.findIndex((r) => r.length > 1);
    const target = grid[rowIdx]![1]!;

    const { caseA, caseBAsIR } = runBoth([moveOp(target, "left")]);
    expect(locate(caseA.layout, target)).toEqual([rowIdx, 0]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("transfers to the row below for `down`, clamped to the target row's length", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    // Deliberately NOT `caseTest` — it sits in the fixture's LAST row, where
    // `down` correctly has no room. Take a key from row 0 instead.
    const target = idGrid(before)[0]![0]!;
    const targetRowLength = idGrid(before)[1]!.length;

    const { caseA, caseBAsIR } = runBoth([moveOp(target, "down")]);
    expect(locate(caseA.layout, target)).toEqual([1, Math.min(0, targetRowLength)]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("transfers to the row above for `up`, identically on both sides", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const target = idGrid(before)[1]![0]!;

    const { caseA, caseBAsIR } = runBoth([moveOp(target, "up")]);
    const [row] = locate(caseA.layout, target);
    expect(row).toBe(0);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("lands at the END of a shorter target row rather than past it", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    // The fixture's rows are 4,4,4,7 — so a key late in the 7-key row moving
    // UP has an index beyond the 4-key row's length, which is the clamp case.
    const grid = idGrid(before);
    const longRow = grid.findIndex((r) => r.length === 7);
    const target = grid[longRow]![6]!;
    const shorterRowLength = grid[longRow - 1]!.length;

    const { caseA, caseBAsIR } = runBoth([moveOp(target, "up")]);
    expect(locate(caseA.layout, target)).toEqual([longRow - 1, shorterRowLength]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("never wraps: a key at index 0 moving `left` changes nothing, on both sides", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const first = idGrid(before)[0]![0]!;

    const { caseA, caseB, caseBAsIR } = runBoth([moveOp(first, "left")]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(before));
    expect(idGrid(caseBAsIR)).toEqual(idGrid(before));
    // Reported, never silent — both sides warn.
    expect(caseA.warnings).toHaveLength(1);
    expect(caseB.warnings).toHaveLength(1);
  });

  it("never wraps: a key in the last row moving `down` changes nothing, on both sides", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const grid = idGrid(before);
    const last = grid[grid.length - 1]![0]!;

    const { caseA, caseBAsIR } = runBoth([moveOp(last, "down")]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(before));
    expect(idGrid(caseBAsIR)).toEqual(idGrid(before));
  });

  it("never wraps: a key at the end of its row moving `right` changes nothing", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const row0 = idGrid(before)[0]!;
    const lastInRow = row0[row0.length - 1]!;

    const { caseA, caseBAsIR } = runBoth([moveOp(lastInRow, "right")]);
    expect(idGrid(caseA.layout)).toEqual(idGrid(before));
    expect(idGrid(caseBAsIR)).toEqual(idGrid(before));
  });

  it("leaves an emptied source row in place, measuring rowTotal 0 rather than disappearing", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const rowCountBefore = phoneDefault(before).rows.length;
    // Empty row 0 by moving every one of its keys down, one op each.
    const row0 = idGrid(before)[0]!;
    const ops: KeyEditOperation[] = row0.map((id, i) => ({
      seq: i + 1,
      kind: "move",
      address: touchKeyAddress("phone", "default", id),
      direction: "down",
    }));

    const { caseA, caseBAsIR } = runBoth(ops);
    expect(idGrid(caseA.layout)[0]).toEqual([]);
    expect(phoneDefault(caseA.layout).rows).toHaveLength(rowCountBefore);
    expect(computeRowMetrics(phoneDefault(caseA.layout).rows[0]!.keys, "phone").rowTotal).toBe(0);
    expect(idGrid(caseA.layout)).toEqual(idGrid(caseBAsIR));
  });

  it("preserves identity, sub-keys, geometry and provenance across a move (FR-021)", () => {
    // The longpress host is the fixture's richest key: sk[], flick{}, a real
    // provenance, and a nodeId. Give it geometry first so `width`/`pad` are
    // present to survive, then move it.
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const address = touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.longpressHost);
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address, fields: { width: 175, pad: 5, hint: "h", layer: "shift" } },
      { seq: 2, kind: "move", address, direction: "down" },
    ];

    const caseA = applyKeyEditsToLayout(before, ops);
    const caseB = applyKeyEditsToRawJson(rawJson, ops);
    const caseBAsIR = parseTouchLayout(caseB.json);

    const find = (layout: TouchLayoutIR): TouchKeyIR | undefined => {
      for (const row of phoneDefault(layout).rows) {
        const hit = row.keys.find((k) => k.id === TOUCH_JOIN_IDS.longpressHost);
        if (hit) return hit;
      }
      return undefined;
    };

    const original = find(before)!;
    const movedA = find(caseA.layout)!;
    const movedB = find(caseBAsIR)!;

    // Identity: Case A splices the existing node, so the nodeId is the SAME
    // object's — not a freshly minted one. This is the assertion that would
    // fail if `move` were ever re-implemented as remove + add.
    expect(movedA.nodeId).toBe(original.nodeId);
    // Sub-keys and provenance survive untouched.
    expect(movedA.sk).toEqual(original.sk);
    expect(movedA.flick).toEqual(original.flick);
    expect(movedA.multitap).toEqual(original.multitap);
    expect(movedA.provenance).toEqual(original.provenance);
    // Geometry and the other newly editable fields survive the move.
    expect(movedA.width).toBe(175);
    expect(movedA.pad).toBe(5);
    expect(movedA.hint).toBe("h");
    expect(movedA.layer).toBe("shift");
    // And Case B agrees on all of it except node ids — the one thing the twin
    // comparison excuses by contract, stripped recursively through `sk`,
    // `multitap` and `flick` by the same helper the main comparison uses.
    expect(stripNodeId(movedA)).toEqual(stripNodeId(movedB));
  });

  it("rejects a family-scoped move on both sides rather than half-applying it", () => {
    const rawJson = emitTouchLayout(makeTouchKeyRuleJoinLayout());
    const before = parseTouchLayout(rawJson);
    const ops: KeyEditOperation[] = [
      {
        seq: 1,
        kind: "move",
        address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.caseTest),
        direction: "right",
        scope: "family",
      },
    ];

    const caseA = applyKeyEditsToLayout(before, ops);
    const caseB = applyKeyEditsToRawJson(rawJson, ops);
    expect(idGrid(caseA.layout)).toEqual(idGrid(before));
    expect(idGrid(parseTouchLayout(caseB.json))).toEqual(idGrid(before));
    expect(caseA.orphaned).toHaveLength(1);
    expect(caseA.warnings).toHaveLength(1);
    expect(caseB.warnings).toHaveLength(1);
  });
});
