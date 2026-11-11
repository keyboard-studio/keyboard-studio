// keyFirstDisplacementFor (spec 117 T053, research R9): the Layout tab's key-first view of the
// Assign tab's displacement ledger. Given a key, layer and incoming text, it reports what the key
// types now and loses, and where the incoming text is already typed, using the same occupancy
// ledger and the same decline key (`displaced|vkey|mods|incoming`).

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { buildSlotOccupancy, slotKeyFor } from "../../survey/slotOccupancy.ts";
import { displacementDismissalKey } from "../assignLoop/useDisplacementProposal.ts";
import { keyFirstDisplacementFor } from "./keyFirstDisplacement.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'kfd'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [K_N] > 'n'
+ [RALT K_N] > U+00F1
`;

const ir = () => parseKmn(KMN, "kfd").ir;
const edit = (e: Omit<Extract<KmnEdit, { op: "set-key" }>, "seq" | "at">, seq = 1): KmnEdit => ({ ...e, seq, at: 0 });

describe("keyFirstDisplacementFor", () => {
  it("reports what the key types now as the displaced glyph", () => {
    const r = keyFirstDisplacementFor(ir(), "K_A", [], "z");
    expect(r.displaced?.char).toBe("a");
    expect(r.alreadyTypedAt).toEqual([]);
  });

  it("a free slot displaces nothing", () => {
    expect(keyFirstDisplacementFor(ir(), "K_Q", [], "z").displaced).toBeNull();
  });

  it("assigning what the slot already types displaces nothing", () => {
    expect(keyFirstDisplacementFor(ir(), "K_A", [], "a").displaced).toBeNull();
  });

  it("names every other slot that already types the incoming text", () => {
    const r = keyFirstDisplacementFor(ir(), "K_B", [], "ñ");
    expect(r.alreadyTypedAt).toEqual([{ vkey: "K_N", modifiers: ["RALT"] }]);
  });

  it("flags a displaced glyph that is typed nowhere else as lost", () => {
    const lost = keyFirstDisplacementFor(ir(), "K_B", [], "z");
    expect(lost.displaced?.char).toBe("b");
    expect(lost.displacedIsLost).toBe(true);
    // The glyph the replaced key typed is still typed on another slot: nothing is lost.
    const kept = keyFirstDisplacementFor(ir(), "K_N", [], "z");
    expect(kept.displaced?.char).toBe("n");
    expect(kept.displacedIsLost).toBe(true);
  });

  it("uses the Assign tab decline key, and honours a recorded decline", () => {
    const r = keyFirstDisplacementFor(ir(), "K_A", ["SHIFT"], "z");
    expect(r.displaced?.char).toBe("A");
    const key = displacementDismissalKey({ displacedChar: "A", incomingChar: "z", vkey: "K_A", modifiers: ["SHIFT"] });
    expect(r.declineKey).toBe(key);
    expect(r.declined).toBe(false);
    expect(keyFirstDisplacementFor(ir(), "K_A", ["SHIFT"], "z", { declined: [key] }).declined).toBe(true);
  });

  it("the ledger sees kmn-edits outputs: an edited key is the incumbent, and a nul key is free", () => {
    const entries: KmnEdit[] = [
      edit({ op: "set-key", vkey: "K_Q", layer: [], output: { kind: "text", text: "ŋ" } }, 1),
      edit({ op: "set-key", vkey: "K_B", layer: [], output: { kind: "nul" } }, 2),
    ];
    const base = ir();
    const occ = buildSlotOccupancy(base, [], entries);
    expect(occ.get(slotKeyFor("K_Q", []))?.char).toBe("ŋ");
    expect(occ.has(slotKeyFor("K_B", []))).toBe(false);
    const r = keyFirstDisplacementFor(base, "K_W", [], "ŋ", { kmnEdits: entries });
    expect(r.alreadyTypedAt).toEqual([{ vkey: "K_Q", modifiers: [] }]);
  });
});
