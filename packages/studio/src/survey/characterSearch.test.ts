// Unit tests for characterSearch.ts's matchesQuery — the four search modes
// (glyph / codepoint / name / base-letter) independent of CharacterMapPane's
// rendering, plus the empty-query no-match contract.

import { describe, it, expect } from "vitest";
import { matchesQuery } from "./characterSearch.ts";

const COMBINING_ACUTE = "́";

describe("matchesQuery", () => {
  it("empty (or whitespace-only) query never matches", () => {
    expect(matchesQuery({ char: "a" }, "")).toBe(false);
    expect(matchesQuery({ char: "a" }, "   ")).toBe(false);
  });

  it("(a) glyph: raw substring match against the character itself", () => {
    expect(matchesQuery({ char: "a" }, "a")).toBe(true);
    expect(matchesQuery({ char: "b" }, "a")).toBe(false);
  });

  it("(b) codepoint: exact U+XXXX and bare hex forms", () => {
    const cellA = { char: "A" }; // U+0041
    expect(matchesQuery(cellA, "U+0041")).toBe(true);
    expect(matchesQuery(cellA, "u+0041")).toBe(true);
    expect(matchesQuery(cellA, "0041")).toBe(true);
    expect(matchesQuery(cellA, "0042")).toBe(false);
  });

  it("(b) codepoint: partial hex prefix matches every codepoint in that range", () => {
    // U+0030 '0' .. U+003F '?' all start with "003".
    expect(matchesQuery({ char: "0" }, "003")).toBe(true); // U+0030
    expect(matchesQuery({ char: "9" }, "003")).toBe(true); // U+0039
    expect(matchesQuery({ char: "?" }, "003")).toBe(true); // U+003F
    expect(matchesQuery({ char: "A" }, "003")).toBe(false); // U+0041
  });

  it("(c) name: case-insensitive substring against the Unicode name", () => {
    expect(matchesQuery({ char: COMBINING_ACUTE, name: "COMBINING ACUTE ACCENT" }, "acute")).toBe(
      true,
    );
    expect(matchesQuery({ char: COMBINING_ACUTE, name: "COMBINING ACUTE ACCENT" }, "ACUTE")).toBe(
      true,
    );
    expect(matchesQuery({ char: "a", name: "LATIN SMALL LETTER A" }, "latin small letter o")).toBe(
      false,
    );
    // No name at all — never matches on mode (c).
    expect(matchesQuery({ char: "a" }, "letter")).toBe(false);
  });

  it("(d) base letter: single-letter query folds NFD base, case-insensitively", () => {
    expect(matchesQuery({ char: "o" }, "o")).toBe(true);
    expect(matchesQuery({ char: "ó" }, "o")).toBe(true); // NFD -> o + acute
    expect(matchesQuery({ char: "ø" }, "o")).toBe(true); // non-decomposing, BASE_FOLD entry
    expect(matchesQuery({ char: "O" }, "o")).toBe(true); // case-insensitive
    expect(matchesQuery({ char: "ợ" }, "o")).toBe(true); // NFD fully decomposes to "o" + marks
    expect(matchesQuery({ char: "b" }, "o")).toBe(false);
  });

  it("(d) base letter: multi-character queries never trigger base-letter folding", () => {
    // "on" is 2 characters — must fall through to the other modes only.
    expect(matchesQuery({ char: "o" }, "on")).toBe(false);
  });

  it("BASE_FOLD covers every documented non-decomposing letter", () => {
    const cases: Array<[string, string]> = [
      ["œ", "o"],
      ["ø", "o"],
      ["ơ", "o"],
      ["ư", "u"],
      ["æ", "a"],
      ["ð", "d"],
      ["đ", "d"],
      ["ł", "l"],
      ["ß", "s"],
    ];
    for (const [char, base] of cases) {
      expect(matchesQuery({ char }, base)).toBe(true);
    }
  });

  it("characterization: a single-digit query composes glyph + hex-prefix matches", () => {
    // "1" is BOTH a glyph match against U+0031 "1" itself (mode a) AND a
    // hex-prefix match (mode b) against every codepoint whose padded hex
    // starts with "1" (e.g. U+1000 MYANMAR LETTER KA). This is the intended
    // OR-composition tradeoff — a bare digit query is deliberately broad, not
    // scoped to "look like this digit". Locks current behavior; not a
    // requirement that it stay this way.
    expect(matchesQuery({ char: "1" }, "1")).toBe(true); // glyph match, U+0031
    expect(matchesQuery({ char: "\u{1000}" }, "1")).toBe(true); // hex-prefix match, U+1000
    expect(matchesQuery({ char: "2" }, "1")).toBe(false); // neither glyph nor hex-prefix
  });

  it("modes compose with OR — any single mode matching is sufficient", () => {
    // Matches by name only, not by glyph/codepoint/base-letter.
    expect(matchesQuery({ char: "\u{1E900}", name: "ADLAM CAPITAL LETTER ALIF" }, "adlam")).toBe(
      true,
    );
  });
});
