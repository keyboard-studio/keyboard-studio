// End-to-end regression for the Step 1.5 carve keycap projection in
// projectWorkingCopyVfs.
//
// This file does NOT mock @keyboard-studio/engine — it exercises the real
// applyCarveKeycapRemovalsToVfs pass so we observe the actual `.kvks` and
// `.keyman-touch-layout` content after a carve, proving the layer files keep
// their structure while the carved character's keycaps go blank.
//
// AC#1: A store-slot carve blanks the keycap labeled with that slot's char in
//       both layer files; sibling keys and layer structure survive; baseIr is
//       not mutated.
// AC#2: Ordering — a carve of a char plus an S-01 assignment of the same char
//       in one projection ends with the keycap POPULATED (Step 3.5 assignment
//       labels win over the Step 1.5 blank).

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore, MechanismAssignment, StoreItem } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

/**
 * Parallel deadkey fan-out IR: dk(0x3b) any(dkfX) > index(dktX, 2), with the
 * output store dktX = ['é', 'à'] — carving slot 0 removes the é producer.
 */
function makeFanOutIr() {
  const outputStore = makeStore("store#dkt", "dktX", [
    { kind: "char", value: "é" },
    { kind: "char", value: "à" },
  ]);
  const inputStore = makeStore("store#dkf", "dkfX", [
    { kind: "char", value: "e" },
    { kind: "char", value: "a" },
  ]);
  const rule: IRRule = {
    nodeId: "rule#dk",
    context: [
      { kind: "deadkey", id: 0x003b },
      { kind: "any", storeRef: "dkfX" },
    ],
    output: [{ kind: "index", storeRef: "dktX", offset: 2 }],
  };
  return makeTestIR([makeGroup("group#main", "main", [rule])], [outputStore, inputStore]);
}

const KVKS = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
<key vkey="K_E">é</key>
</layer>
</encoding>
</visualkeyboard>`;

const TOUCH_LAYOUT = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a", sk: [{ id: "U_00E9", text: "é" }] },
              { id: "K_E", text: "é" },
            ],
          },
        ],
      },
    ],
  },
});

function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
    { path: `source/${keyboardId}.kvks`, content: KVKS, isBinary: false },
    { path: `source/${keyboardId}.keyman-touch-layout`, content: TOUCH_LAYOUT, isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs carve keycaps end-to-end — real engine, no mock", () => {
  it("AC#1: slot carve blanks the matching keycaps in both layer files; structure survives; baseIr not mutated", () => {
    const ir = makeFanOutIr();
    const irBefore = structuredClone(ir);
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#0"]), // carve the é slot
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    // .kvks: the é keycap is blanked in place; the element, its siblings, and
    // the layer structure all survive.
    const kvks = vfs.get("source/test_kb.kvks")?.content as string;
    expect(kvks).toContain('<key vkey="K_E"></key>');
    expect(kvks).toContain('<key vkey="K_A">a</key>');
    expect(kvks.match(/<layer\b/g)).toHaveLength(1);

    // .keyman-touch-layout: the é main key keeps its object with blank text;
    // the é longpress entry is removed (property dropped when emptied); the
    // sibling key is untouched.
    const touch = JSON.parse(
      vfs.get("source/test_kb.keyman-touch-layout")?.content as string,
    );
    const keys = touch.tablet.layer[0].row[0].key;
    expect(keys).toHaveLength(2);
    expect(keys[0].text).toBe("a");
    expect(keys[0].sk).toBeUndefined();
    expect(keys[1].id).toBe("K_E");
    expect(keys[1].text).toBe("");

    expect(ir).toEqual(irBefore);
  });

  it("AC#2: an S-01 assignment of the carved char in the same projection re-populates the keycap (Step 3.5 wins)", () => {
    const ir = makeFanOutIr();
    const vfs = makeVfs("test_kb");

    const s01Assignment: MechanismAssignment = {
      scope: "individual",
      target: "é",
      modality: "physical",
      mechanisms: [
        {
          patternId: "p_s01",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_E] > U+00E9" },
        },
      ],
    };

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#0"]),
      assignments: [s01Assignment],
      // Pattern resolution is irrelevant here — Step 3.5 keycap labels read
      // strategyId/slotValues directly; the unknown pattern only yields a
      // Step 2 warning.
      getPattern: () => undefined,
      identity: null,
    });

    const kvks = vfs.get("source/test_kb.kvks")?.content as string;
    // Step 1.5 blanked K_E, then Step 3.5 wrote the assigned é back onto it.
    expect(kvks).toContain('<key vkey="K_E">é</key>');
  });
});
