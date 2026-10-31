// A carve of one slot in a positionally paired store set drops that index
// from EVERY paired store (to keep index() alignment). The cascade is
// intentional; what these tests pin is that it is REPORTED, so a caller can
// show the author which partner characters went with the one they chose.
//
// Shapes covered:
//   - camqwerty `composed` / `comp-dia`, tied by
//       any(composed) + [K_BKSP] > index(comp-dia,1)
//     carved from either side;
//   - the deadkey from/to pair  dk(003b) any(dkf) > index(dkt, 2);
//   - both halves chosen by the author (nothing cascaded: nothing unchosen);
//   - an unpaired store (nothing cascaded).

import { describe, it, expect } from "vitest";
import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { charStore, irGroup, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { deriveCarvedIr } from "./carvePipeline.js";
import { applyStoreSlotRemovals } from "./applyStoreSlotRemovals.js";

function camqwertyIr(): KeyboardIR {
  const composed = charStore({ nodeId: "s#composed", name: "composed", chars: ["à", "è", "ì"] });
  const compDia = charStore({ nodeId: "s#comp-dia", name: "comp-dia", chars: ["a", "e", "i"] });
  const rule: IRRule = {
    nodeId: "rule#bksp",
    context: [
      { kind: "any", storeRef: "composed" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_BKSP", modifiers: [] },
    ],
    output: [{ kind: "index", storeRef: "comp-dia", offset: 1 }],
  };
  const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
  return makeTestIR([group], [composed, compDia]);
}

function deadkeyPairIr(): KeyboardIR {
  const dkf = charStore({ nodeId: "s#dkf", name: "dkf003b", chars: ["a", "b", "c"] });
  const dkt = charStore({ nodeId: "s#dkt", name: "dkt003b", chars: ["À", "Ɛ", "Ç"] });
  const rule: IRRule = {
    nodeId: "rule#dk",
    context: [
      { kind: "deadkey", id: 0x003b },
      { kind: "any", storeRef: "dkf003b" },
    ],
    output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
  };
  return makeTestIR([irGroup({ nodeId: "g#dk", rules: [rule] })], [dkf, dkt]);
}

const charsOf = (ir: KeyboardIR, name: string) =>
  ir.stores.find((s) => s.name === name)!.items.map((i) => (i.kind === "char" ? i.value : i.kind));

const carve = (ir: KeyboardIR, ...slotIds: string[]) =>
  deriveCarvedIr(ir, { deletedNodeIds: new Set(), deletedItemIds: new Set(slotIds) });

describe("paired-store carve cascade is reported", () => {
  it("carving a base letter in comp-dia drops AND reports its composed partner", () => {
    const res = carve(camqwertyIr(), "s#comp-dia#0");
    expect(charsOf(res.ir, "comp-dia")).toEqual(["e", "i"]);
    expect(charsOf(res.ir, "composed")).toEqual(["è", "ì"]);
    expect(res.cascadedRemovals).toEqual([
      {
        position: 0,
        chosen: { storeName: "comp-dia", char: "a" },
        partner: { storeName: "composed", char: "à" },
      },
    ]);
  });

  it("carving the composed char reports the base letter that went with it", () => {
    const res = carve(camqwertyIr(), "s#composed#1");
    expect(charsOf(res.ir, "comp-dia")).toEqual(["a", "i"]);
    expect(res.cascadedRemovals).toEqual([
      {
        position: 1,
        chosen: { storeName: "composed", char: "è" },
        partner: { storeName: "comp-dia", char: "e" },
      },
    ]);
  });

  it("reports the deadkey from/to pair the same way", () => {
    const res = carve(deadkeyPairIr(), "s#dkt#1");
    expect(charsOf(res.ir, "dkf003b")).toEqual(["a", "c"]);
    expect(charsOf(res.ir, "dkt003b")).toEqual(["À", "Ç"]);
    expect(res.cascadedRemovals).toEqual([
      {
        position: 1,
        chosen: { storeName: "dkt003b", char: "Ɛ" },
        partner: { storeName: "dkf003b", char: "b" },
      },
    ]);
  });

  it("reports nothing for a partner the author also chose", () => {
    const res = carve(camqwertyIr(), "s#comp-dia#0", "s#composed#0");
    expect(charsOf(res.ir, "composed")).toEqual(["è", "ì"]);
    expect(res.cascadedRemovals).toEqual([]);
  });

  it("reports one entry per chosen slot when several positions are carved", () => {
    const res = carve(camqwertyIr(), "s#comp-dia#0", "s#comp-dia#2");
    expect(res.cascadedRemovals.map((c) => [c.position, c.partner.char])).toEqual([
      [0, "à"],
      [2, "ì"],
    ]);
  });

  it("reports nothing when the store is not paired with another store", () => {
    const solo = charStore({ nodeId: "s#solo", name: "solo", chars: ["x", "y"] });
    const ir = makeTestIR([irGroup({ nodeId: "g#s", rules: [] })], [solo]);
    expect(carve(ir, "s#solo#0").cascadedRemovals).toEqual([]);
  });

  it("applyStoreSlotRemovals exposes the same report for a preview, without mutating", () => {
    const ir = camqwertyIr();
    const before = structuredClone(ir);
    const preview = applyStoreSlotRemovals(ir, new Set(["s#comp-dia#0"]), { carveNotAnyHygiene: true });
    expect(preview.cascaded).toHaveLength(1);
    expect(preview.cascaded[0]?.partner).toEqual({ storeName: "composed", char: "à" });
    expect(ir).toEqual(before);
  });
});
