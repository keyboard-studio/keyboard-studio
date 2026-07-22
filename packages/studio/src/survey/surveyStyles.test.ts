// Unit tests for the Phase B font-selection helpers exported by
// surveyStyles.ts: FONT_OPTIONS, DEFAULT_PHASE_B_FONT, phaseBFontStack, and
// isPhaseBFontValue. Scope: the pure lookup/fallback/guard logic in
// isolation — the dropdown UI and store wiring that consume these are
// covered in Dropdown.test.tsx / phaseBDraftStore.test.ts /
// draftPersistence.test.ts respectively; do not re-cover them here.

import { describe, it, expect } from "vitest";
import {
  FONT_OPTIONS,
  DEFAULT_PHASE_B_FONT,
  phaseBFontStack,
  isPhaseBFontValue,
} from "./surveyStyles.ts";

describe("FONT_OPTIONS", () => {
  it("has Noto Sans as the first entry, matching DEFAULT_PHASE_B_FONT's fallback stack", () => {
    expect(FONT_OPTIONS[0]).toEqual({
      value: "noto-sans",
      label: "Noto Sans",
      stack: "'Noto Sans', system-ui, sans-serif",
    });
  });

  it("includes Charis SIL as the second entry", () => {
    expect(FONT_OPTIONS[1]).toEqual({
      value: "charis-sil",
      label: "Charis SIL",
      stack: "'Charis SIL', serif",
    });
  });

  it("DEFAULT_PHASE_B_FONT is one of FONT_OPTIONS's own values", () => {
    expect(FONT_OPTIONS.some((o) => o.value === DEFAULT_PHASE_B_FONT)).toBe(true);
  });
});

describe("phaseBFontStack", () => {
  it("resolves 'noto-sans' to the Noto Sans stack", () => {
    expect(phaseBFontStack("noto-sans")).toBe("'Noto Sans', system-ui, sans-serif");
  });

  it("resolves 'charis-sil' to the Charis SIL stack", () => {
    expect(phaseBFontStack("charis-sil")).toBe("'Charis SIL', serif");
  });

  it("falls back to the default font's stack for an unknown value", () => {
    expect(phaseBFontStack("comic-sans")).toBe(FONT_OPTIONS[0]!.stack);
  });

  it("falls back to the default font's stack for an empty string", () => {
    expect(phaseBFontStack("")).toBe(FONT_OPTIONS[0]!.stack);
  });
});

describe("isPhaseBFontValue", () => {
  it("accepts 'noto-sans'", () => {
    expect(isPhaseBFontValue("noto-sans")).toBe(true);
  });

  it("accepts 'charis-sil'", () => {
    expect(isPhaseBFontValue("charis-sil")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isPhaseBFontValue("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isPhaseBFontValue(undefined)).toBe(false);
  });

  it("rejects an arbitrary unknown string", () => {
    expect(isPhaseBFontValue("comic-sans")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isPhaseBFontValue(42)).toBe(false);
  });
});
