// Unit tests for parseSpacedChars() from PhaseB.tsx.
//
// TextSampleView calls parseSpacedChars() to turn the user's space-delimited
// input ("a b c ŋ ɛ ɔ") into a deduplicated NFC array used as confirmedInventory.
// These tests document the exact behaviour the UI depends on.
//
// What is NOT tested here:
//   - validate() for the textarea — covered in
//     packages/studio/src/survey/questions/b/pb_text_sample.test.ts
//   - SurveyRunner / manual path — unrelated to TextSampleView
//   - CharacterDiscoveryService (harvestFromText, pickerCandidates, etc.)

import { describe, it, expect } from "vitest";
import { parseSpacedChars } from "./PhaseB.tsx";

describe("parseSpacedChars", () => {
  // 1. Happy path: single-space delimited ASCII input.
  it("splits on single spaces and returns each token", () => {
    expect(parseSpacedChars("a b c")).toEqual(["a", "b", "c"]);
  });

  // 2. Multiple consecutive spaces / tabs / newlines are all treated as
  //    a single delimiter — the UI must not produce empty entries.
  it("collapses multiple whitespace characters into one delimiter", () => {
    expect(parseSpacedChars("a  b\t\tc\n\nd")).toEqual(["a", "b", "c", "d"]);
  });

  // 3. Leading and trailing whitespace produces no empty tokens.
  it("ignores leading and trailing whitespace", () => {
    expect(parseSpacedChars("  a b c  ")).toEqual(["a", "b", "c"]);
  });

  // 4. Non-Latin characters are returned unchanged (no ASCII filter).
  //    The core use case is African / minority-language letters.
  it("returns non-Latin characters: ŋ ɛ ɔ", () => {
    expect(parseSpacedChars("ŋ ɛ ɔ")).toEqual(["ŋ", "ɛ", "ɔ"]);
  });

  // 5. Duplicates are silently dropped; first occurrence wins.
  //    A user who accidentally types "a b a c" should get ["a", "b", "c"].
  it("deduplicates — first occurrence wins, later duplicates dropped", () => {
    expect(parseSpacedChars("a b a c b")).toEqual(["a", "b", "c"]);
  });

  // 6. NFC normalization: a precomposed character and its NFD-decomposed
  //    equivalent must be treated as the same grapheme.
  //    é as NFC (U+00E9) and é as NFD (e + U+0301 combining acute) must
  //    deduplicate to one entry and the result is the NFC form.
  it("NFC-normalizes tokens — NFD and NFC forms of the same grapheme deduplicate", () => {
    const NFD_E_ACUTE = "é"; // e + combining acute accent
    const NFC_E_ACUTE = "é";  // é as a single precomposed codepoint
    // NFD form comes first — result must be the NFC-normalised value
    const result = parseSpacedChars(`${NFD_E_ACUTE} ${NFC_E_ACUTE}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NFC_E_ACUTE);
  });

  // 7. NFC normalization is applied to each token individually.
  //    A decomposed character in isolation must come back as its NFC form.
  it("returns NFC form of a decomposed input token", () => {
    const NFD_E_ACUTE = "é";
    const NFC_E_ACUTE = "é";
    const result = parseSpacedChars(NFD_E_ACUTE);
    expect(result).toEqual([NFC_E_ACUTE]);
  });

  // 8. Multi-codepoint grapheme cluster (base + combining mark) stays together
  //    as a single entry — the UI renders it as one chip.
  //    ŋ̈ (ŋ + combining diaeresis) is a single user-perceived character.
  it("multi-codepoint grapheme cluster is kept as one entry", () => {
    const ENG_WITH_DIAERESIS = "ŋ̈"; // ŋ + combining diaeresis
    const result = parseSpacedChars(ENG_WITH_DIAERESIS);
    // After NFC normalization the cluster may stay multi-codepoint (no precomposed form)
    // but must produce exactly one entry
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ENG_WITH_DIAERESIS.normalize("NFC"));
  });

  // 9. Whitespace-only input returns an empty array.
  //    The Extract button is already disabled for this case, but parseSpacedChars
  //    must be safe if called anyway.
  it("whitespace-only input returns empty array", () => {
    expect(parseSpacedChars("   \t\n\r")).toEqual([]);
  });

  // 10. Empty string returns empty array.
  it("empty string returns empty array", () => {
    expect(parseSpacedChars("")).toEqual([]);
  });

  // 11. Single character with no spaces.
  it("single token with no spaces returns single-entry array", () => {
    expect(parseSpacedChars("ŋ")).toEqual(["ŋ"]);
  });

  // 12. Insertion order is preserved (first-occurrence order, not alphabetical).
  //    The review grid should render characters in the order the user typed them.
  it("preserves first-occurrence order — not alphabetical", () => {
    expect(parseSpacedChars("c a b")).toEqual(["c", "a", "b"]);
  });

  // 13. Mixed-script input (Latin + Arabic + Devanagari) all pass through.
  //    No script filter is applied.
  it("returns characters from multiple scripts in input order", () => {
    expect(parseSpacedChars("a ب क")).toEqual(["a", "ب", "क"]);
  });
});
