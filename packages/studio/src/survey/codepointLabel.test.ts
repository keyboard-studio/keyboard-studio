import { describe, it, expect } from "vitest";
import { codepointLabel } from "./codepointLabel.ts";

describe("codepointLabel", () => {
  it("single code point → base only, no extras, plain U+XXXX title", () => {
    expect(codepointLabel("a")).toEqual({ base: "U+0061", extras: "", title: "U+0061" });
  });

  it("multi-code-point grapheme (no composed form) → base + literal extra marks + full stack title", () => {
    // Ə + combining acute (U+018F U+0301) has no single composed form; extras is
    // the acute mark itself, for the "[+́]" badge.
    const graph = "Ə́";
    expect(codepointLabel(graph)).toEqual({
      base: "U+018F",
      extras: "́",
      title: "U+018F U+0301",
    });
  });

  it("pads short code points to four hex digits and upper-cases them", () => {
    expect(codepointLabel("\r")).toEqual({ base: "U+000D", extras: "", title: "U+000D" });
  });

  it("handles an astral single grapheme as one code point", () => {
    const astral = String.fromCodePoint(0x1f600); // one code point, above BMP
    expect(codepointLabel(astral)).toEqual({ base: "U+1F600", extras: "", title: "U+1F600" });
  });
});
