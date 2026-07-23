/**
 * Unit tests for the shared codepoint utilities in charUtils.ts, focused on
 * isNoncharacterCodePoint() — the single canonical noncharacter-range check
 * previously duplicated across charUtils.ts and characterMap.ts. (The Layer A
 * codepointFormat.ts lint keeps a deliberately narrower, non-equivalent
 * BMP-only check and is not a consumer of this helper — see its comment.)
 */

import { describe, it, expect } from "vitest";
import { isNoncharacterCodePoint, parseUPlusNotation, toHex4, toUPlusNotation } from "./charUtils.js";

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
