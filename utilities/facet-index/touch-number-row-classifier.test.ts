/**
 * Touch number-row classifier unit tests (spec 041 US2, T025).
 */

import { describe, it, expect } from "vitest";

import { classifyTouchNumberRow } from "./touch-number-row-classifier.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const IR = {} as KeyboardIR;
const DEF = {} as FacetDefinition;

function kb(json: string | null): ScannedKeyboard {
  const sources = json === null ? [] : [{ path: "release/x/fx/source/fx.keyman-touch-layout", bytes: Buffer.from(json, "utf8") }];
  return { id: "fx", kpsPath: "release/x/fx/source/fx.kps", kmnPath: null, kmnText: null, sources };
}

const DIGIT_ROW = JSON.stringify({
  phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_1", text: "1" }, { id: "K_2", text: "2" }] }] }] },
});

describe("classifyTouchNumberRow", () => {
  it("notApplicable when there is no touch layout", () => {
    const cat = classifyTouchNumberRow(IR, DEF, kb(null))!;
    expect(cat.notApplicable).toBe(true);
    expect(cat.value).toBeUndefined();
  });

  it("digits when the top row carries digits", () => {
    const cat = classifyTouchNumberRow(IR, DEF, kb(DIGIT_ROW))!;
    expect(cat.value).toBe("digits");
    expect(cat.consistency).toBe(1);
    expect(cat.provenanceTier).toBe("content-derived");
  });
});
