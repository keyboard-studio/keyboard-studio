/**
 * Unit tests for the shared codepoint utilities in charUtils.ts, focused on
 * isNoncharacterCodePoint() — the single canonical noncharacter-range check
 * previously duplicated across charUtils.ts and characterMap.ts. (The Layer A
 * codepointFormat.ts lint keeps a deliberately narrower, non-equivalent
 * BMP-only check and is not a consumer of this helper — see its comment.)
 */

import { describe, it, expect } from "vitest";
import { isNoncharacterCodePoint, parseUPlusNotation } from "./charUtils.js";

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
