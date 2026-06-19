// see spec.md §8 step 1, §9 — type-coverage tests for the related-language
// base-matching contract types. Shape-only under strict tsconfig
// (exactOptionalPropertyTypes + noUncheckedIndexedAccess), matching
// provenance.test.ts / types.test.ts.

import { describe, it, expect } from "vitest";
import { ImportStatus } from "./keyboard-ir";
import type {
  BaseLayoutFamily,
  CorpusKeyboardEntry,
  LanguageRelatednessRecord,
  RelatednessProvenance,
  RelatednessTier,
} from "./baseMatching";

describe("CorpusKeyboardEntry", () => {
  it("describes a release/ keyboard with declared languages and produced glyphs", () => {
    const entry: CorpusKeyboardEntry = {
      id: "bambara",
      path: "release/b/bambara",
      script: "Latn",
      baseLayoutFamily: "QWERTY",
      languages: ["bm", "dyu"],
      producedGlyphs: ["a", "b", "ɛ", "ɔ", "ɲ", "ŋ"],
      importStatus: ImportStatus.Clean,
      opaqueFeatureCount: 0,
    };
    expect(entry.languages).toContain("bm");
    expect(entry.producedGlyphs).toContain("ɛ");
  });

  it("allows omitting the optional baseLayoutFamily", () => {
    const entry: CorpusKeyboardEntry = {
      id: "x",
      path: "release/x/x",
      script: "Latn",
      languages: [],
      producedGlyphs: [],
      importStatus: ImportStatus.CleanWithOpaque,
      opaqueFeatureCount: 2,
    };
    expect(entry.baseLayoutFamily).toBeUndefined();
  });
});

describe("LanguageRelatednessRecord", () => {
  it("carries macrolanguage, family path, and countries", () => {
    const rec: LanguageRelatednessRecord = {
      code: "bm",
      macrolanguage: "man",
      familyPath: ["Niger-Congo", "Atlantic-Congo", "Mande", "Manding"],
      countries: ["ML", "BF"],
    };
    expect(rec.familyPath?.[0]).toBe("Niger-Congo");
  });

  it("is valid with only the required code (sparse data)", () => {
    const rec: LanguageRelatednessRecord = { code: "und" };
    expect(rec.macrolanguage).toBeUndefined();
  });
});

describe("RelatednessProvenance", () => {
  it("records the tier, evidence counts, and a composite score", () => {
    const prov: RelatednessProvenance = {
      tier: "same-macrolanguage",
      relatedLanguage: "Bambara",
      sharedRegion: "Mali",
      sharedCharCount: 18,
      targetCharCount: 22,
      score: 0.86,
    };
    expect(prov.sharedCharCount).toBeLessThanOrEqual(prov.targetCharCount);
    expect(prov.score).toBeGreaterThan(0);
    expect(prov.score).toBeLessThanOrEqual(1);
  });
});

describe("union members", () => {
  it("enumerates the relatedness tiers strongest-first", () => {
    const tiers: RelatednessTier[] = [
      "same-macrolanguage",
      "same-genus",
      "same-family",
      "co-resident",
      "character-overlap",
      "unrelated",
    ];
    expect(tiers).toHaveLength(6);
  });

  it("enumerates the base-layout families", () => {
    const families: BaseLayoutFamily[] = ["QWERTY", "AZERTY", "QWERTZ"];
    expect(families).toHaveLength(3);
  });
});
