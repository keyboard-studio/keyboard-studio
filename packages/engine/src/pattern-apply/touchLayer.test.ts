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

  it("targets the shift layer for an uppercase base + combining mark that HAS a precomposed form", () => {
    // "A" + combining ring above (U+030A). Its NFC form is a single uppercase
    // code point ("Å"); both the composed and decomposed spellings must route
    // to "shift", since the rule reads the base code point's case.
    const nfdGrapheme = "A" + String.fromCharCode(0x030a);
    expect(touchLayerForChar(nfdGrapheme)).toBe(SHIFT_TOUCH_LAYER);
    expect(touchLayerForChar(nfdGrapheme.normalize("NFC"))).toBe(SHIFT_TOUCH_LAYER);
  });

  it("targets the shift layer for an uppercase base + combining mark with NO precomposed form", () => {
    // Capital eng (U+014A) + combining grave (U+0300) — NFC is a no-op here,
    // so the grapheme is never a single \p{Lu} code point. An anchored
    // /^\p{Lu}$/ would misroute this to the lowercase "default" layer; the
    // non-composable stacking this exercises is common in minority-language
    // orthographies, which is why the rule tests the base code point only.
    const nonComposable = String.fromCodePoint(0x014a, 0x0300);
    expect(nonComposable.normalize("NFC")).toBe(nonComposable); // no precomposed form
    expect(touchLayerForChar(nonComposable)).toBe(SHIFT_TOUCH_LAYER);
  });

  it("targets the default layer for a lowercase base + combining mark with NO precomposed form", () => {
    // The lowercase counterpart of the case above (U+014B + U+0300) must
    // still route to "default" — the un-anchored test must not turn every
    // multi-code-point grapheme into a shift-layer placement.
    const nonComposable = String.fromCodePoint(0x014b, 0x0300);
    expect(touchLayerForChar(nonComposable)).toBe(DEFAULT_TOUCH_LAYER);
  });

  it("targets the default layer for a bare combining mark", () => {
    expect(touchLayerForChar(String.fromCodePoint(0x0300))).toBe(DEFAULT_TOUCH_LAYER);
  });
});
