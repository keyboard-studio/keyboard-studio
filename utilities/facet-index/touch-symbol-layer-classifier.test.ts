/**
 * Touch symbol-layer classifier unit tests (spec 041 US2, T026).
 */

import { describe, it, expect } from "vitest";

import { classifyTouchSymbolLayer } from "./touch-symbol-layer-classifier.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const IR = {} as KeyboardIR;
const DEF = {} as FacetDefinition;

function kb(json: string | null): ScannedKeyboard {
  const sources = json === null ? [] : [{ path: "release/x/fx/source/fx.keyman-touch-layout", bytes: Buffer.from(json, "utf8") }];
  return { id: "fx", kpsPath: "release/x/fx/source/fx.kps", kmnPath: null, kmnText: null, sources };
}

const WITH_SYMBOL = JSON.stringify({
  phone: { layer: [{ id: "default", row: [] }, { id: "symbol", row: [] }] },
});
const WITHOUT_SYMBOL = JSON.stringify({
  phone: { layer: [{ id: "default", row: [] }, { id: "shift", row: [] }] },
});

describe("classifyTouchSymbolLayer", () => {
  it("notApplicable when there is no touch layout", () => {
    const cat = classifyTouchSymbolLayer(IR, DEF, kb(null))!;
    expect(cat.notApplicable).toBe(true);
  });

  it("present when a symbol layer exists", () => {
    expect(classifyTouchSymbolLayer(IR, DEF, kb(WITH_SYMBOL))!.value).toBe("present");
  });

  it("absent when no symbol layer exists", () => {
    expect(classifyTouchSymbolLayer(IR, DEF, kb(WITHOUT_SYMBOL))!.value).toBe("absent");
  });
});
