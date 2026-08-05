/**
 * Unit tests for the shared codepoint utilities in charUtils.ts, focused on
 * isNoncharacterCodePoint() — the single canonical noncharacter-range check
 * previously duplicated across charUtils.ts and characterMap.ts. (The Layer A
 * codepointFormat.ts lint keeps a deliberately narrower, non-equivalent
 * BMP-only check and is not a consumer of this helper — see its comment.)
 */

import { describe, it, expect } from "vitest";
import {
  isDecomposableAccented,
  isNoncharacterCodePoint,
  parseUPlusNotation,
  toHex4,
  toUPlusNotation,
} from "./charUtils.js";

describe("toHex4", () => {
  it("pads a BMP codepoint to 4 uppercase hex digits", () => {
    expect(toHex4(0x0041)).toBe("0041");
    expect(toHex4(0x61)).toBe("0061"); // single hex digit still pads to 4
  });

  it("passes an astral codepoint through unpadded at 5-6 digits (the pad is a floor, not a fixed width)", () => {
    expect(toHex4(0x1f600)).toBe("1F600"); // 5 digits
    expect(toHex4(0x10ffff)).toBe("10FFFF"); // 6 digits, the Unicode maximum
  });

  it("backs toUPlusNotation's per-codepoint formatting — the two must agree, or CharScrollStrip's chip/badge testids and its visible U+ notation would drift apart", () => {
    expect(toUPlusNotation("A")).toBe(`U+${toHex4(0x0041)}`);
    expect(toUPlusNotation("\u{1F600}")).toBe(`U+${toHex4(0x1f600)}`);
  });
});

describe("isNoncharacterCodePoint", () => {
  it.each([0xfffe, 0xffff, 0x1fffe, 0xfdd0, 0xfdef])(
    "returns true for noncharacter U+%s",
    (cp) => {
      expect(isNoncharacterCodePoint(cp)).toBe(true);
    },
  );

  it.each([0x0041, 0xfdcf, 0xfdf0])("returns false for non-noncharacter U+%s", (cp) => {
    expect(isNoncharacterCodePoint(cp)).toBe(false);
  });
});

describe("isDecomposableAccented (abugida-safe narrowing to Mn-only, km-domain ruling)", () => {
  it.each([
    ["ǯ", "ǯ"], // LATIN SMALL LETTER EZH WITH CARON -> ʒ + U+030C (Mn)
    ["ӝ", "ӝ"], // CYRILLIC SMALL LETTER ZHE WITH DIAERESIS -> ж + U+0308 (Mn)
    ["Hebrew letter+niqqud (dagesh)", "בּ"], // ב + dagesh (Mn)
    ["Arabic letter+harakat (fatha)", "بَ"], // ب + fatha (Mn)
    ["à", "à"], // LATIN SMALL LETTER A WITH GRAVE -> a + U+0300 (Mn)
  ])("still returns true for %s (Mn mark, unaffected by the narrowing)", (_label, char) => {
    expect(isDecomposableAccented(char)).toBe(true);
  });

  it.each([
    ["का", "का"], // Devanagari क + vowel sign AA (Mc matra)
    ["कि", "कि"], // Devanagari क + vowel sign I (Mc matra)
    ["की", "की"], // Devanagari क + vowel sign II (Mc matra)
  ])(
    "returns false for the Devanagari matra syllable %s (Mc, not Mn — no longer matches after the abugida-safe narrowing)",
    (_label, char) => {
      expect(isDecomposableAccented(char)).toBe(false);
    },
  );

  it("still returns true for consonant+virama (क + U+094D) — virama is Mn and General_Category-universal, not abugida-specific, so the predicate alone does not exclude it; callers gate separately on scriptClass", () => {
    expect(isDecomposableAccented("क्")).toBe(true);
  });
});

describe("parseUPlusNotation (noncharacter rejection unaffected by refactor)", () => {
  it("returns null for noncharacter codepoints", () => {
    expect(parseUPlusNotation("U+FFFE")).toBeNull();
    expect(parseUPlusNotation("U+FDD0")).toBeNull();
    expect(parseUPlusNotation("U+1FFFE")).toBeNull();
  });

  it("returns the character for an ordinary codepoint", () => {
    expect(parseUPlusNotation("U+0041")).toBe("A");
  });
});
