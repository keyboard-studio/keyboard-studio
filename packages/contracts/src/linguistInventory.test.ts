// see spec.md section 8 step 4 — type-coverage + factory/flatten tests for the
// structured LinguistInventory (the linguist agent's output, the orthography
// discovery method). Shape-only under strict tsconfig, matching types.test.ts.

import { describe, it, expect } from "vitest";
import type {
  LinguistInventory,
  CasedLetters,
  AuxiliaryLetters,
  InventoryFlag,
  InventoryFlagIssue,
  InventorySource,
} from "./linguistInventory";
import {
  makeLinguistInventory,
  linguistInventoryChars,
} from "./linguistInventory";
import {
  hausaWithDigraphs,
  hindiWithNukta,
  hebrewWithDirectionMarks,
} from "./fixtures/linguistInventories";

// A compact French-ish exemplar reused across cases.
const baseInit = {
  language: "fr",
  script: "Latin",
  alphabetCore: {
    lowercase: ["a", "b", "c"],
    uppercase: ["A", "B", "C"],
  } satisfies CasedLetters,
  mandatoryDiacriticsAndLigatures: ["œ", "æ", "ç"],
  languageSpecificPunctuation: ["«", "»"],
  numerals: ["0", "1", "2"],
};

describe("LinguistInventory shape", () => {
  it("requires the core groups; auxiliary/flags/sources optional", () => {
    const inv: LinguistInventory = makeLinguistInventory(baseInit);
    expect(inv.alphabetCore.lowercase).toContain("a");
    expect("alphabetAuxiliary" in inv).toBe(false);
    expect("flags" in inv).toBe(false);
    expect("sources" in inv).toBe(false);
  });

  it("auxiliary letters carry an optional note", () => {
    const aux: AuxiliaryLetters = {
      lowercase: ["w"],
      uppercase: ["W"],
      note: "loanwords only",
    };
    const inv: LinguistInventory = makeLinguistInventory({
      ...baseInit,
      alphabetAuxiliary: aux,
    });
    expect(inv.alphabetAuxiliary?.note).toBe("loanwords only");
  });

  it("accepts both InventoryFlagIssue literals", () => {
    const issues: InventoryFlagIssue[] = ["not-attested", "cldr-omitted"];
    issues.forEach((issue) => {
      const f: InventoryFlag = { char: "ǂ", issue };
      expect(f.issue).toBe(issue);
    });
  });

  it("sources carry an optional url + kind", () => {
    const s: InventorySource = {
      title: "CLDR exemplarCharacters",
      kind: "cldr",
    };
    expect(s.kind).toBe("cldr");
    expect("url" in s).toBe(false);
  });
});

describe("makeLinguistInventory factory", () => {
  it("strips an undefined nested auxiliary note (exactOptionalPropertyTypes)", () => {
    const inv = makeLinguistInventory({
      ...baseInit,
      alphabetAuxiliary: { lowercase: ["w"], uppercase: ["W"], note: undefined },
    });
    expect(inv.alphabetAuxiliary).toEqual({
      lowercase: ["w"],
      uppercase: ["W"],
    });
    expect("note" in (inv.alphabetAuxiliary ?? {})).toBe(false);
  });

  it("omits optional top-level keys when not provided", () => {
    const inv = makeLinguistInventory({
      ...baseInit,
      flags: undefined,
      sources: undefined,
    });
    expect("flags" in inv).toBe(false);
    expect("sources" in inv).toBe(false);
  });

  it("preserves flags and sources when present", () => {
    const inv = makeLinguistInventory({
      ...baseInit,
      flags: [{ char: "x", issue: "not-attested" }],
      sources: [{ title: "Omniglot", url: "https://omniglot.com", kind: "other" }],
    });
    expect(inv.flags).toHaveLength(1);
    expect(inv.sources?.[0]?.url).toBe("https://omniglot.com");
  });
});

describe("linguistInventoryChars flatten", () => {
  it("flattens in order: core → auxiliary → ligatures → punctuation → numerals", () => {
    const inv = makeLinguistInventory({
      ...baseInit,
      alphabetAuxiliary: { lowercase: ["w"], uppercase: ["W"] },
    });
    expect(linguistInventoryChars(inv)).toEqual([
      "a", "b", "c", "A", "B", "C", // core lower then upper
      "w", "W", // auxiliary
      "œ", "æ", "ç", // ligatures
      "«", "»", // punctuation
      "0", "1", "2", // numerals
    ]);
  });

  it("de-duplicates, keeping the first occurrence", () => {
    const inv = makeLinguistInventory({
      language: "xx",
      script: "Latin",
      alphabetCore: { lowercase: ["a", "c"], uppercase: ["A"] },
      // "c" also appears as a ligature/base — must not double up.
      mandatoryDiacriticsAndLigatures: ["c", "ç"],
      languageSpecificPunctuation: [],
      numerals: [],
    });
    expect(linguistInventoryChars(inv)).toEqual(["a", "c", "A", "ç"]);
  });

  it("works when there is no auxiliary alphabet", () => {
    const inv = makeLinguistInventory(baseInit);
    expect(linguistInventoryChars(inv)).toEqual([
      "a", "b", "c", "A", "B", "C", "œ", "æ", "ç", "«", "»", "0", "1", "2",
    ]);
  });
});

describe("optional fields — issue #191 coverage", () => {
  it("linguistInventoryChars includes digraphsAsPhonemeUnits after numerals", () => {
    const chars = linguistInventoryChars(hausaWithDigraphs);
    const lastNumeralIdx = chars.lastIndexOf("2");
    expect(chars).toContain("sh");
    expect(chars).toContain("ng");
    expect(chars.indexOf("sh")).toBeGreaterThan(lastNumeralIdx);
    expect(chars.indexOf("ng")).toBeGreaterThan(lastNumeralIdx);
  });

  it("linguistInventoryChars includes nukta markers and independent vowels", () => {
    const chars = linguistInventoryChars(hindiWithNukta);
    expect(chars).toContain("क़");
    expect(chars).toContain("ख़");
    expect(chars).toContain("अ");
    expect(chars).toContain("आ");
    expect(chars).toContain("इ");
    expect(chars).toContain("ई");
  });

  it("linguistInventoryChars handles inventory with no new optional fields", () => {
    const inv = makeLinguistInventory({
      language: "en",
      script: "Latin",
      alphabetCore: { lowercase: ["a", "b"], uppercase: ["A", "B"] },
      mandatoryDiacriticsAndLigatures: [],
      languageSpecificPunctuation: [],
      numerals: ["0"],
    });
    const chars = linguistInventoryChars(inv);
    // ?? [] guards fire cleanly — no error, only core chars present
    expect(chars).toEqual(["a", "b", "A", "B", "0"]);
  });

  it("makeLinguistInventory roundtrips digraphsAsPhonemeUnits", () => {
    const inv = makeLinguistInventory({
      ...baseInit,
      digraphsAsPhonemeUnits: ["sh", "ts", "ny", "ng"],
    });
    expect(inv.digraphsAsPhonemeUnits).toEqual(["sh", "ts", "ny", "ng"]);
  });

  it("makeLinguistInventory omits undefined optional fields", () => {
    const inv = makeLinguistInventory(baseInit);
    expect("digraphsAsPhonemeUnits" in inv).toBe(false);
    expect("nuktaAndBorrowedSoundMarkers" in inv).toBe(false);
    expect("independentVowels" in inv).toBe(false);
    expect("directionControlChars" in inv).toBe(false);
    expect("syllabicFinalMarkers" in inv).toBe(false);
  });

  it("linguistInventoryChars includes directionControlChars after numerals", () => {
    const chars = linguistInventoryChars(hebrewWithDirectionMarks);
    expect(chars).toContain("‏"); // U+200F RIGHT-TO-LEFT MARK
    expect(chars).toContain("‎"); // U+200E LEFT-TO-RIGHT MARK
    const lastNumeralIdx = chars.lastIndexOf("1");
    expect(chars.indexOf("‏")).toBeGreaterThan(lastNumeralIdx);
  });

  it("linguistInventoryChars includes syllabicFinalMarkers after numerals", () => {
    const chars = linguistInventoryChars(hebrewWithDirectionMarks);
    expect(chars).toContain("ᐧ"); // U+1427 CANADIAN SYLLABICS FINAL MIDDLE DOT
    const lastNumeralIdx = chars.lastIndexOf("1");
    expect(chars.indexOf("ᐧ")).toBeGreaterThan(lastNumeralIdx);
  });
});
