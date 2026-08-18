import { describe, it, expect } from "vitest";
import { oneMarkShorterPair } from "./mark-decomposition.js";

describe("oneMarkShorterPair", () => {
  it("drops one mark from a single-mark composed unit, landing on the bare base", () => {
    // à (U+00E0) -> NFD "a" + U+0300 -> drop the only mark -> "a".
    const result = oneMarkShorterPair("à".normalize("NFC"));
    expect(result?.to).toBe("a");
    expect(result?.nfd).toEqual(["a", "̀"]);
  });

  it("drops the canonically-last mark from a two-mark composed unit", () => {
    // U+1EC7 "e with circumflex and dot below" -> NFD is [e, dot-below (220), circumflex (230)]
    // (canonical ordering sorts by combining class, below before above) ->
    // dropping the last leaves "e" + dot-below, recomposed to U+1EB9.
    const unit = "ệ";
    const result = oneMarkShorterPair(unit);
    expect(result?.nfd).toEqual(["e", "̣", "̂"]);
    expect(result?.to).toBe("ẹ");
  });

  it("returns undefined for a unit with no canonical decomposition", () => {
    expect(oneMarkShorterPair("a")).toBeUndefined();
    expect(oneMarkShorterPair("x")).toBeUndefined();
  });

  it("returns undefined for a multi-codepoint string (not a single composed unit)", () => {
    expect(oneMarkShorterPair("ab")).toBeUndefined();
  });

  it("returns undefined when the one-mark-shorter predecessor has no single-codepoint precomposed form", () => {
    // U+FB2C "HEBREW LETTER SHIN WITH DAGESH AND SHIN DOT" -> NFD is
    // [shin (05E9), dagesh (05BC, cc 21), shin dot (05C1, cc 24)]. Dropping the
    // canonically-last mark (shin dot) leaves shin + dagesh, which has no
    // assigned precomposed codepoint of its own (Hebrew presentation forms
    // only precompose shin+dot or shin+dagesh+dot, never dagesh alone) —
    // recomposing to NFC stays 2 codepoints.
    expect(oneMarkShorterPair("שּׁ")).toBeUndefined();
  });
});
