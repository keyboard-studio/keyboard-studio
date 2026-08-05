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

  it("decomposes a base letter plus a General_Category Me (enclosing) mark - real orthography", () => {
    // U+0430 CYRILLIC SMALL LETTER A + U+0489 COMBINING CYRILLIC MILLIONS
    // SIGN (Me). isCombiningMarkChar/isCombining were widened from Mn+Mc to
    // the full \p{M} (Mn/Mc/Me) class; this locks in that decomposeGrapheme
    // routes the Me mark into `marks`, not treating the sequence as a
    // multi-base digraph.
    const MILLIONS_SIGN = "҉";
    expect(decomposeGrapheme("а" + MILLIONS_SIGN)).toEqual({
      base: "а",
      marks: [MILLIONS_SIGN],
    });
  });

  it("decomposes a base letter plus a General_Category Me (enclosing) mark - symbolic case", () => {
    // U+0061 LATIN SMALL LETTER A + U+20DD COMBINING ENCLOSING CIRCLE (Me).
    const ENCLOSING_CIRCLE = "⃝";
    expect(decomposeGrapheme("a" + ENCLOSING_CIRCLE)).toEqual({
      base: "a",
      marks: [ENCLOSING_CIRCLE],
    });
  });
});
