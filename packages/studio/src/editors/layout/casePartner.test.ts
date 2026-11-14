// casePartner (spec 117 T052): Unicode simple case mapping, the paired layer, read-only partners
// reported not offered, and a declined partner not proposed again.

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { casePartnerFor, pairedLayer, simpleCaseMap } from "./casePartner.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'cp'
store(&TARGETS) 'any'
store(letters) 'abc'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [SHIFT K_B] > any(letters)
+ [RALT K_C] > 'c'
+ [SHIFT RALT K_C] > 'C'
+ [NCAPS K_D] > 'd'
`;
const ir = () => parseKmn(KMN, "cp").ir;

describe("simpleCaseMap", () => {
  it("maps one code point to one code point, either direction", () => {
    expect(simpleCaseMap("ŋ", true)).toBe("Ŋ");
    expect(simpleCaseMap("Ŋ", false)).toBe("ŋ");
  });
  it("offers nothing for no mapping, a full mapping, or several characters", () => {
    expect(simpleCaseMap("1", true)).toBeNull();
    expect(simpleCaseMap("ß", true)).toBeNull();
    expect(simpleCaseMap("ab", true)).toBeNull();
  });
});

describe("pairedLayer", () => {
  it("toggles Shift on every layer, with and without other modifiers", () => {
    expect(pairedLayer([])).toEqual(["SHIFT"]);
    expect(pairedLayer(["SHIFT"])).toEqual([]);
    expect(pairedLayer(["RALT"])).toEqual(["SHIFT", "RALT"]);
    expect(pairedLayer(["SHIFT", "RALT"])).toEqual(["RALT"]);
    expect(pairedLayer(["NCAPS"])).toEqual(["SHIFT", "NCAPS"]);
  });
});

describe("casePartnerFor", () => {
  it("offers the capital on the Shift layer for a lowercase default-layer edit", () => {
    expect(casePartnerFor({ ir: ir(), vkey: "K_A", layer: [], text: "ŋ" })).toEqual({
      kind: "offer",
      vkey: "K_A",
      layer: ["SHIFT"],
      text: "Ŋ",
    });
  });

  it("offers the lowercase on the default layer for a Shift edit", () => {
    const r = casePartnerFor({ ir: ir(), vkey: "K_A", layer: ["SHIFT"], text: "Ŋ" });
    expect(r).toMatchObject({ kind: "offer", layer: [], text: "ŋ" });
  });

  it("pairs AltGr with Shift+AltGr and covers Caps Lock layers", () => {
    expect(casePartnerFor({ ir: ir(), vkey: "K_C", layer: ["RALT"], text: "ŋ" })).toMatchObject({
      kind: "offer",
      layer: ["SHIFT", "RALT"],
    });
    expect(casePartnerFor({ ir: ir(), vkey: "K_D", layer: ["NCAPS"], text: "ŋ" })).toMatchObject({
      kind: "offer",
      layer: ["SHIFT", "NCAPS"],
    });
  });

  it("reports a read-only partner key instead of offering it", () => {
    expect(casePartnerFor({ ir: ir(), vkey: "K_B", layer: [], text: "ŋ" })).toEqual({
      kind: "none",
      reason: "read-only",
    });
  });

  it("offers nothing when the text has no simple case mapping", () => {
    expect(casePartnerFor({ ir: ir(), vkey: "K_A", layer: [], text: "1" })).toEqual({ kind: "none", reason: "no-mapping" });
  });

  it("does not propose again for a key and layer the author declined", () => {
    const declined: KmnEdit = { seq: 1, at: 0, op: "decline-case-partner", vkey: "K_A", layer: [], partner: "Ŋ" };
    expect(casePartnerFor({ ir: ir(), vkey: "K_A", layer: [], text: "ŋ", entries: [declined] })).toEqual({
      kind: "none",
      reason: "declined",
    });
    // A different key is still offered.
    expect(casePartnerFor({ ir: ir(), vkey: "K_C", layer: ["RALT"], text: "ŋ", entries: [declined] }).kind).toBe("offer");
  });
});
