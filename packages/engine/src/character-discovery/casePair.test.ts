import { describe, it, expect } from "vitest";
import { caseCounterpart } from "./casePair.js";

describe("caseCounterpart", () => {
  it("theta lowercase -> uppercase", () => {
    expect(caseCounterpart("θ")).toEqual({ counterpart: "Θ", direction: "toUpper" });
  });

  it("theta uppercase -> lowercase (bidirectional)", () => {
    expect(caseCounterpart("Θ")).toEqual({ counterpart: "θ", direction: "toLower" });
  });

  it("returns null for ß (multi-char SS expansion)", () => {
    expect(caseCounterpart("ß")).toBeNull();
  });

  it("returns null for ﬃ ligature (multi-char FFI expansion)", () => {
    expect(caseCounterpart("ﬃ")).toBeNull();
  });

  it("returns null for Arabic alef (caseless script)", () => {
    expect(caseCounterpart("ا")).toBeNull();
  });

  it("returns null for Devanagari ka (caseless script)", () => {
    expect(caseCounterpart("क")).toBeNull();
  });

  it("returns null for a standalone combining mark (U+0300)", () => {
    expect(caseCounterpart("̀")).toBeNull();
  });

  it("maps i -> İ under the tr locale tag (dotted capital I)", () => {
    expect(caseCounterpart("i", "tr")).toEqual({ counterpart: "İ", direction: "toUpper" });
  });

  it("maps i -> I with no locale tag", () => {
    expect(caseCounterpart("i")).toEqual({ counterpart: "I", direction: "toUpper" });
  });

  it("Cherokee uppercase -> lowercase pair works", () => {
    expect(caseCounterpart("Ꭰ")).toEqual({ counterpart: "ꭰ", direction: "toLower" });
  });

  it("Cherokee lowercase -> uppercase pair works", () => {
    expect(caseCounterpart("ꭰ")).toEqual({ counterpart: "Ꭰ", direction: "toUpper" });
  });

  it("returns null for an already-covered equal-case letter (U+0138 kra)", () => {
    expect(caseCounterpart("ĸ")).toBeNull();
  });

  it("returns null for a multi-code-point input", () => {
    expect(caseCounterpart("ab")).toBeNull();
  });

  it("falls back to the locale-insensitive mapping for a malformed bcp47 tag (no throw)", () => {
    expect(caseCounterpart("a", "not a tag!!")).toEqual({
      counterpart: "A",
      direction: "toUpper",
    });
  });
});
