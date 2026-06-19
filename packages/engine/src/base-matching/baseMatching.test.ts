// Tests for related-language base-matching (spec §8 step 1): the relatedness
// prior, the character-overlap evidence, and their composite ranking.

import { describe, it, expect } from "vitest";
import type { LanguageRelatednessRecord } from "@keyboard-studio/contracts";
import { pairRelatedness } from "./relatedness.js";
import { rankRelatedBases, indexRelatednessData } from "./rankRelated.js";

// A small Manding-family fixture: Bambara (bm) and Dyula (dyu) are dialect
// siblings under the Manding macrolanguage (man), both spoken in Mali (ML);
// Hindi (hi) is an unrelated Indo-Aryan language.
const records: LanguageRelatednessRecord[] = [
  {
    code: "bm",
    macrolanguage: "man",
    familyPath: ["Niger-Congo", "Mande", "Manding"],
    countries: ["ML", "BF"],
  },
  {
    code: "dyu",
    macrolanguage: "man",
    familyPath: ["Niger-Congo", "Mande", "Manding"],
    countries: ["ML", "CI"],
  },
  {
    code: "ff",
    familyPath: ["Niger-Congo", "Atlantic", "Fula"],
    countries: ["ML", "SN"],
  },
  { code: "hi", familyPath: ["Indo-European", "Indo-Aryan"], countries: ["IN"] },
];
const data = indexRelatednessData(records);

describe("pairRelatedness", () => {
  it("rates dialect siblings under one macrolanguage as same-macrolanguage", () => {
    expect(pairRelatedness("dyu", "bm", data).tier).toBe("same-macrolanguage");
  });

  it("rates same-family different-genus pairs as same-family + reports shared country", () => {
    const r = pairRelatedness("dyu", "ff", data);
    expect(r.tier).toBe("same-family"); // both Niger-Congo, different sub-branch
    expect(r.sharedCountry).toBe("ML");
  });

  it("rates unrelated families as unrelated", () => {
    expect(pairRelatedness("dyu", "hi", data).tier).toBe("unrelated");
  });

  it("degrades to unrelated when a code is missing from the data", () => {
    expect(pairRelatedness("dyu", "zzz", data).tier).toBe("unrelated");
  });
});

describe("rankRelatedBases", () => {
  const targetChars = new Set(["a", "ɛ", "ɔ", "ɲ", "ŋ", "ɟ"]); // Dyula specials

  it("ranks a related-language keyboard with high overlap near the top", () => {
    const out = rankRelatedBases(
      "dyu",
      targetChars,
      [
        {
          id: "bambara",
          languages: ["bm"],
          producedGlyphs: ["a", "ɛ", "ɔ", "ɲ", "ŋ"], // 5/6 of target
        },
      ],
      data,
    );
    const v = out["bambara"];
    expect(v?.tier).toBe("same-macrolanguage");
    expect(v?.relatedLanguage).toBe("bm");
    expect(v?.sharedRegion).toBe("ML");
    expect(v?.sharedCharCount).toBe(5);
    expect(v?.targetCharCount).toBe(6);
    expect(v?.score ?? 0).toBeGreaterThan(0.8);
  });

  it("qualifies an unrelated keyboard on character overlap alone (character-overlap tier)", () => {
    const out = rankRelatedBases(
      "dyu",
      targetChars,
      [{ id: "ipa_like", languages: ["xyz"], producedGlyphs: ["ɛ", "ɔ", "ɲ", "ŋ"] }], // 4/6 ≥ floor 0.5
      data,
    );
    expect(out["ipa_like"]?.tier).toBe("character-overlap");
  });

  it("omits an unrelated, low-overlap candidate", () => {
    const out = rankRelatedBases(
      "dyu",
      targetChars,
      [{ id: "spanish", languages: ["es"], producedGlyphs: ["a", "ñ"] }], // 1/6 < floor
      data,
    );
    expect(out["spanish"]).toBeUndefined();
  });

  it("resolves display names when a resolver is supplied", () => {
    const out = rankRelatedBases(
      "dyu",
      targetChars,
      [{ id: "bambara", languages: ["bm"], producedGlyphs: ["a", "ɛ", "ɔ"] }],
      data,
      {
        nameOf: (c) => (c === "bm" ? "Bambara" : undefined),
        regionNameOf: (c) => (c === "ML" ? "Mali" : undefined),
      },
    );
    expect(out["bambara"]?.relatedLanguage).toBe("Bambara");
    expect(out["bambara"]?.sharedRegion).toBe("Mali");
  });

  it("scores a closer relative above a more distant one at equal overlap", () => {
    const out = rankRelatedBases(
      "dyu",
      targetChars,
      [
        { id: "sibling", languages: ["bm"], producedGlyphs: ["a", "ɛ", "ɔ"] }, // same-macrolanguage
        { id: "cousin", languages: ["ff"], producedGlyphs: ["a", "ɛ", "ɔ"] }, // same-family
      ],
      data,
    );
    expect(out["sibling"]?.score ?? 0).toBeGreaterThan(out["cousin"]?.score ?? 0);
  });
});
