/**
 * Unit tests for touchLayer.ts — the shared "absent layer === default" rule
 * and the case->layer placement rule (`touchLayerForChar`).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOUCH_LAYER,
  SHIFT_TOUCH_LAYER,
  resolveTouchLayerId,
  touchLayerForChar,
} from "./touchLayer.js";

describe("resolveTouchLayerId", () => {
  it("returns the layer slot value when present", () => {
    expect(resolveTouchLayerId({ layer: "shift" })).toBe("shift");
  });

  it("falls back to DEFAULT_TOUCH_LAYER when the layer slot is absent", () => {
    expect(resolveTouchLayerId({ hostKey: "K_A" })).toBe(DEFAULT_TOUCH_LAYER);
  });

  it("falls back to DEFAULT_TOUCH_LAYER when slotValues itself is undefined", () => {
    expect(resolveTouchLayerId(undefined)).toBe(DEFAULT_TOUCH_LAYER);
  });
});

describe("touchLayerForChar", () => {
  it("targets the shift layer for an uppercase letter", () => {
    expect(touchLayerForChar("Á")).toBe(SHIFT_TOUCH_LAYER);
    expect(touchLayerForChar("A")).toBe(SHIFT_TOUCH_LAYER);
  });

  it("targets the default layer for a lowercase letter", () => {
    expect(touchLayerForChar("á")).toBe(DEFAULT_TOUCH_LAYER);
    expect(touchLayerForChar("a")).toBe(DEFAULT_TOUCH_LAYER);
  });

  it("targets the default layer for a non-letter (digit)", () => {
    expect(touchLayerForChar("5")).toBe(DEFAULT_TOUCH_LAYER);
  });

  it("targets the default layer for a multi-codepoint grapheme (NFD, not a single \\p{Lu})", () => {
    // "A" + combining ring above (U+030A) — an NFD sequence, not a single
    // uppercase code point; the case rule operates on NFC-normalized single
    // chars, so callers must normalize before calling (as both appliers do).
    const nfdGrapheme = "A" + String.fromCharCode(0x030a);
    expect(touchLayerForChar(nfdGrapheme)).toBe(DEFAULT_TOUCH_LAYER);
    // Its NFC form IS a single uppercase code point ("Å").
    expect(touchLayerForChar(nfdGrapheme.normalize("NFC"))).toBe(SHIFT_TOUCH_LAYER);
  });
});
