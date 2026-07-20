/**
 * Touch modifier-layers classifier unit tests (spec 041 US2, T027).
 */

import { describe, it, expect } from "vitest";

import { classifyTouchModifierLayers } from "./touch-modifier-layers-classifier.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const IR = {} as KeyboardIR;
const DEF = {} as FacetDefinition;

function kb(json: string | null): ScannedKeyboard {
  const sources = json === null ? [] : [{ path: "release/x/fx/source/fx.keyman-touch-layout", bytes: Buffer.from(json, "utf8") }];
  return { id: "fx", kpsPath: "release/x/fx/source/fx.kps", kmnPath: null, kmnText: null, sources };
}

const WITH_MODIFIERS = JSON.stringify({
  phone: {
    layer: [
      { id: "default", row: [] },
      { id: "shift", row: [] },
      { id: "alt", row: [] },
      { id: "rightalt", row: [] },
    ],
  },
});
const NO_MODIFIERS = JSON.stringify({
  phone: { layer: [{ id: "default", row: [] }, { id: "shift", row: [] }, { id: "symbol", row: [] }] },
});

describe("classifyTouchModifierLayers", () => {
  it("notApplicable when there is no touch layout", () => {
    const cat = classifyTouchModifierLayers(IR, DEF, kb(null))!;
    expect(cat.notApplicable).toBe(true);
  });

  it("none when no ALT/CTRL-family layers exist", () => {
    const cat = classifyTouchModifierLayers(IR, DEF, kb(NO_MODIFIERS))!;
    expect(cat.value).toBe("none");
    expect(cat.consistency).toBe(1);
    expect(cat.causeTagCounts).toBeUndefined();
  });

  it("maps-desktop-modifiers with capacity-forced cause tags for reproduced layers", () => {
    const cat = classifyTouchModifierLayers(IR, DEF, kb(WITH_MODIFIERS))!;
    expect(cat.value).toBe("maps-desktop-modifiers");
    // alt + rightalt reproduced over default + shift ⇒ 2/4 standard.
    expect(cat.consistency).toBeCloseTo(0.5, 6);
    expect(cat.causeTagCounts).toEqual({ "capacity-forced": 2 });
    expect(cat.provenanceTier).toBe("content-derived");
  });
});
