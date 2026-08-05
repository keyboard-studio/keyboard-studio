// stepWalk — the within-step position vocabulary's token codec and derivations.
//
// The load-bearing property is the ROUND TRIP through the `Location` grammar: a
// footer dot for a gallery character is formatted into the hash and parsed back
// out, and `lib/location.ts`'s `SEGMENT` (`/^[a-z0-9_]+$/`) admits neither the
// character itself nor any percent-encoding of it. A token that fails to satisfy
// that class produces a hash that cannot be parsed, which is a silently dead
// bookmark rather than a visible error — so it is tested against the real regex,
// not a restatement of it.

import { describe, it, expect } from "vitest";
import { parseLocation, formatLocation } from "./location.ts";
import {
  charToPositionToken,
  positionTokenToChar,
  cursorCharIn,
  charWalkLabel,
  stepPositionIds,
  type StepWalkMap,
} from "./stepWalk.ts";

describe("charToPositionToken / positionTokenToChar", () => {
  it("round-trips a BMP character", () => {
    expect(charToPositionToken("á")).toBe("u00e1");
    expect(positionTokenToChar("u00e1")).toBe("á");
  });

  it("round-trips a multi-code-point grapheme, in order", () => {
    // Ə + combining acute — a real Africanist walk stop, and the case a
    // single-code-point token would silently collapse onto its base letter.
    const token = charToPositionToken("Ə́");
    expect(token).toBe("u018f_0301");
    expect(positionTokenToChar(token)).toBe("Ə́");
  });

  it("round-trips an astral character without splitting its surrogate pair", () => {
    const char = "\u{1E900}"; // ADLAM CAPITAL LETTER ALIF
    const token = charToPositionToken(char);
    expect(token).toBe("u1e900");
    expect(positionTokenToChar(token)).toBe(char);
    // A surrogate-pair-naive implementation would emit two 4-digit halves.
    expect(token.includes("_")).toBe(false);
  });

  it("emits only characters the Location grammar accepts, so the hash round-trips", () => {
    for (const char of ["á", "Ə́", "\u{1E900}", "ӝ", "A"]) {
      const token = charToPositionToken(char);
      const hash = formatLocation({ route: "survey", step: "mechanisms", question: token });
      const parsed = parseLocation(hash);
      expect(parsed).toEqual({ route: "survey", step: "mechanisms", question: token });
      expect(positionTokenToChar(parsed!.question!)).toBe(char);
    }
  });

  it("returns null for a token that is not a character token — a flow question id", () => {
    // Question ids share the same slot, so this discrimination is what keeps a
    // gallery decoder from mangling one.
    expect(positionTokenToChar("il_target_script")).toBeNull();
    expect(positionTokenToChar("q1")).toBeNull();
  });

  it("returns null for a malformed or out-of-range token rather than throwing", () => {
    // These arrive from the address bar, so a throw would be a crash on a bad URL.
    expect(positionTokenToChar("u")).toBeNull();
    expect(positionTokenToChar("uzzzz")).toBeNull();
    expect(positionTokenToChar("u00e")).toBeNull();
    expect(positionTokenToChar("u110000")).toBeNull();
  });
});

describe("cursorCharIn", () => {
  it("finds the character the cursor names", () => {
    expect(cursorCharIn("u00e1", ["a", "á", "b"])).toBe("á");
  });

  it("matches by NFC identity, so a re-normalized walk list still resolves", () => {
    // collateInventory NFC-dedups its inventory; a cursor stored against the
    // decomposed form must still find the precomposed stop, or the position
    // would be silently lost on exactly the reflow the walk is built to survive.
    const decomposed = charToPositionToken("á");
    expect(cursorCharIn(decomposed, ["á"])).toBe("á");
  });

  it("is null for an absent cursor, a question id, or a character not in the list", () => {
    expect(cursorCharIn(undefined, ["á"])).toBeNull();
    expect(cursorCharIn("il_target_script", ["á"])).toBeNull();
    expect(cursorCharIn("u00e2", ["á"])).toBeNull();
  });
});

describe("charWalkLabel", () => {
  it("names every code point, not just the first", () => {
    expect(charWalkLabel("á")).toBe("á (U+00E1)");
    expect(charWalkLabel("Ə́")).toBe("Ə́ (U+018F U+0301)");
  });
});

describe("stepPositionIds", () => {
  it("projects each step's stop ids, dropping labels and done flags", () => {
    const walks: StepWalkMap = {
      identity: [{ id: "q1", done: true }, { id: "q2", done: false }],
      mechanisms: [{ id: "u00e1", label: "á (U+00E1)", done: false }],
    };
    expect(stepPositionIds(walks)).toEqual({
      identity: ["q1", "q2"],
      mechanisms: ["u00e1"],
    });
  });

  it("is an empty map for no walks", () => {
    expect(stepPositionIds({})).toEqual({});
  });
});
