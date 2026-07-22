import { describe, expect, it } from "vitest";
import { decomposeGrapheme } from "./decompose.js";

const ACUTE = "́";
const GRAVE = "̀";
const CIRCUMFLEX = "̂";
const UNDERDOT = "̣";

describe("decomposeGrapheme", () => {
  it("decomposes a precomposed single-mark letter", () => {
    expect(decomposeGrapheme("é")).toEqual({ base: "e", marks: [ACUTE] });
  });

  it("decomposes a multi-mark stack, preserving NFD order (closest to base first)", () => {
    // U+1EC7 LATIN SMALL LETTER E WITH CIRCUMFLEX AND DOT BELOW:
    // canonical NFD order puts the underdot (ccc 220) before the circumflex (ccc 230).
    const result = decomposeGrapheme("ệ");
    expect(result).toEqual({ base: "e", marks: [UNDERDOT, CIRCUMFLEX] });
  });

  it("keeps an already-decomposed input's mark order", () => {
    expect(decomposeGrapheme("a" + GRAVE + ACUTE)).toEqual({
      base: "a",
      marks: [GRAVE, ACUTE],
    });
  });

  it("returns null for a plain letter (nothing to decompose)", () => {
    expect(decomposeGrapheme("e")).toBeNull();
    expect(decomposeGrapheme("ŋ")).toBeNull(); // no canonical decomposition
  });

  it("returns null for a lone combining mark", () => {
    expect(decomposeGrapheme(ACUTE)).toBeNull();
  });

  it("returns null for private-use characters (no linguistic data — role question instead)", () => {
    expect(decomposeGrapheme(String.fromCodePoint(0xe000))).toBeNull();
    expect(decomposeGrapheme(String.fromCodePoint(0xf0000))).toBeNull();
  });

  it("returns null for multi-base sequences (digraphs are not stacks)", () => {
    expect(decomposeGrapheme("ch")).toBeNull();
    expect(decomposeGrapheme("é" + "e")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(decomposeGrapheme("")).toBeNull();
  });

  it("handles non-Latin scripts through the same NFD path", () => {
    // U+0915 U+093C (ka + nukta) composes from U+0958; NFD splits it back.
    expect(decomposeGrapheme("क़")).toEqual({ base: "क", marks: ["़"] });
  });
});
