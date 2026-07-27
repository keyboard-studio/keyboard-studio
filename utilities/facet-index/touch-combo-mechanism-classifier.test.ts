/**
 * Touch combo-mechanism classifier unit tests (spec 041 US2, T024).
 */

import { describe, it, expect } from "vitest";

import { classifyTouchComboMechanism } from "./touch-combo-mechanism-classifier.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const IR = {} as KeyboardIR;
const DEF = {} as FacetDefinition;

function kb(json: string | null): ScannedKeyboard {
  const sources = json === null ? [] : [{ path: "release/x/fx/source/fx.keyman-touch-layout", bytes: Buffer.from(json, "utf8") }];
  return { id: "fx", kpsPath: "release/x/fx/source/fx.kps", kmnPath: null, kmnText: null, sources };
}

const LONGPRESS_HEAVY = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a", sk: [{ text: "á" }] },
              { id: "K_E", text: "e", sk: [{ text: "é" }] },
              { id: "K_I", text: "i", sk: [{ text: "í" }] },
              { id: "K_D", text: "d" },
            ],
          },
        ],
      },
    ],
  },
});

describe("classifyTouchComboMechanism", () => {
  it("notApplicable when there is no touch layout", () => {
    const cat = classifyTouchComboMechanism(IR, DEF, kb(null))!;
    expect(cat.notApplicable).toBe(true);
    expect(cat.value).toBeUndefined();
    expect(cat.provenanceTier).toBe("content-derived");
  });

  it("distribution over mechanisms with a dominant value + consistency", () => {
    const cat = classifyTouchComboMechanism(IR, DEF, kb(LONGPRESS_HEAVY))!;
    // 3 longpress + 1 direct key ⇒ longpress dominant at 0.75.
    expect(cat.value).toBe("longpress");
    expect(cat.distribution).toEqual({ key: 0.25, longpress: 0.75 });
    expect(cat.consistency).toBeCloseTo(0.75, 6);
    expect(cat.analyzedCoverage).toBe(1);
  });

  it("distribution keys stay within the facet's mechanism set", () => {
    const cat = classifyTouchComboMechanism(IR, DEF, kb(LONGPRESS_HEAVY))!;
    const allowed = new Set(["key", "layer", "longpress", "flick", "multitap"]);
    for (const k of Object.keys(cat.distribution!)) expect(allowed.has(k)).toBe(true);
    const sum = Object.values(cat.distribution!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});
