// caseOrder.test.ts — unit tests for the shared lowercase-first walk-order
// helper (caseOrder.ts). Both galleries (MechanismGallery via
// useInventoryDiff.ts, TouchGallery directly) depend on `isUppercaseLetter`
// staying a single-codepoint predicate and `lowercaseFirst` staying a stable
// sort — this file is the one place that pins both contracts directly,
// rather than relying on indirect coverage through the two galleries' own
// tests.

import { describe, it, expect } from "vitest";
import { isUppercaseLetter, lowercaseFirst } from "./caseOrder.ts";

describe("isUppercaseLetter", () => {
  it("is true for a single uppercase letter", () => {
    expect(isUppercaseLetter("A")).toBe(true);
    expect(isUppercaseLetter("Ä")).toBe(true);
  });

  it("is false for a single lowercase letter", () => {
    expect(isUppercaseLetter("a")).toBe(false);
    expect(isUppercaseLetter("ä")).toBe(false);
  });

  it("is false for a non-letter (digit / space)", () => {
    expect(isUppercaseLetter("5")).toBe(false);
    expect(isUppercaseLetter(" ")).toBe(false);
  });

  it("is false for the empty string", () => {
    expect(isUppercaseLetter("")).toBe(false);
  });

  it("is false for a multi-codepoint, still-decomposed combining sequence — the [...char].length === 1 guard", () => {
    // Base "A" (U+0041) + COMBINING ACUTE ACCENT (U+0301), deliberately NOT
    // normalized to the single-codepoint precomposed form. `[...char]`
    // splits on codepoints, so this string is length 2 — the
    // `[...char].length === 1` guard must reject it, distinct from the
    // precomposed single-codepoint case below.
    const decomposedAWithAcute = "Á";
    expect([...decomposedAWithAcute]).toHaveLength(2);
    expect(isUppercaseLetter(decomposedAWithAcute)).toBe(false);

    // The precomposed single-codepoint form IS a bare uppercase letter.
    const precomposedAWithAcute = "Á";
    expect([...precomposedAWithAcute]).toHaveLength(1);
    expect(isUppercaseLetter(precomposedAWithAcute)).toBe(true);
  });
});

describe("lowercaseFirst", () => {
  it("reorders so a lowercase letter walks before its uppercase counterpart", () => {
    expect(lowercaseFirst(["A", "a"])).toEqual(["a", "A"]);
  });

  it("is stable — same-case ties keep their original relative order", () => {
    // All lowercase: order must be untouched.
    expect(lowercaseFirst(["b", "a", "c"])).toEqual(["b", "a", "c"]);
    // All uppercase: order must be untouched.
    expect(lowercaseFirst(["B", "A", "C"])).toEqual(["B", "A", "C"]);
  });

  it("leaves non-letters undisturbed relative to the letters around them", () => {
    expect(lowercaseFirst(["A", "5", "a"])).toEqual(["5", "a", "A"]);
  });

  it("sorts a mixed bucket of upper/lower/non-letter entries, uppercase last, ties stable", () => {
    const input = ["Z", "a", "9", "B", "c", " "];
    // Non-uppercase entries (a, 9, c, " ") keep their relative order first,
    // then uppercase entries (Z, B) keep their relative order.
    expect(lowercaseFirst(input)).toEqual(["a", "9", "c", " ", "Z", "B"]);
  });

  it("does not mutate its input array", () => {
    const input = ["B", "a"];
    const result = lowercaseFirst(input);
    expect(input).toEqual(["B", "a"]);
    expect(result).toEqual(["a", "B"]);
  });
});
