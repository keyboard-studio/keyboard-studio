/**
 * Contract tests C1–C9 for the engine langtags lookup API.
 *
 * Source: specs/023-langtags-defaults/contracts/engine-langtags-api.md
 *
 * C1  ha → Latn/NG
 * C2  hi → Deva/IN
 * C3  hau (3-letter ISO 639-3) resolves to the same record as "ha"
 * C4  HA (mixed case) same as "ha"
 * C5  unknown "zzz" → null (never throws)
 * C6  listLanguages() non-empty; every entry has code + englishName
 * C7  lookupByName("haus") includes Hausa (englishName prefix)
 * C8  lookupByName(autonym) includes the language whose localname matches
 * C9  lookupByName("") → []
 */

import { describe, expect, it } from "vitest";
import {
  getLanguageDefaults,
  listLanguages,
  lookupByName,
} from "./index.js";

describe("getLanguageDefaults", () => {
  it("C1 — ha → Latn / NG", () => {
    const result = getLanguageDefaults("ha");
    expect(result).not.toBeNull();
    expect(result!.defaultScript).toBe("Latn");
    expect(result!.defaultRegion).toBe("NG");
    expect(result!.englishName).toBe("Hausa");
  });

  it("C2 — hi → Deva / IN", () => {
    const result = getLanguageDefaults("hi");
    expect(result).not.toBeNull();
    expect(result!.defaultScript).toBe("Deva");
    expect(result!.defaultRegion).toBe("IN");
  });

  it("C3 — hau (3-letter) resolves to the same record as 'ha'", () => {
    const byShort = getLanguageDefaults("ha");
    const byLong = getLanguageDefaults("hau");
    expect(byLong).not.toBeNull();
    expect(byLong).toStrictEqual(byShort);
  });

  it("C4 — HA (mixed case) same as 'ha'", () => {
    const upper = getLanguageDefaults("HA");
    const lower = getLanguageDefaults("ha");
    expect(upper).not.toBeNull();
    expect(upper).toStrictEqual(lower);
  });

  it("C5 — unknown subtag returns null and never throws", () => {
    expect(() => getLanguageDefaults("zzz")).not.toThrow();
    expect(getLanguageDefaults("zzz")).toBeNull();
  });

  it("C10 — iso639_3extra alias resolves to the bare-subtag record", () => {
    // kmr is an iso639_3extra alias for ku (Kurdish); both must return the same record
    const byBare = getLanguageDefaults("ku");
    const byAlias = getLanguageDefaults("kmr");
    expect(byAlias).not.toBeNull();
    expect(byAlias!.code).toBe("ku");
    expect(byAlias).toStrictEqual(byBare);

    // ike is an iso639_3extra alias for iu (Inuktitut); both must return the same record
    const byBareIu = getLanguageDefaults("iu");
    const byAliasIke = getLanguageDefaults("ike");
    expect(byAliasIke).not.toBeNull();
    expect(byAliasIke!.code).toBe("iu");
    expect(byAliasIke).toStrictEqual(byBareIu);
  });
});

describe("listLanguages", () => {
  it("C6 — non-empty; every entry has code and englishName", () => {
    const langs = listLanguages();
    expect(langs.length).toBeGreaterThan(0);
    for (const lang of langs) {
      expect(typeof lang.code).toBe("string");
      expect(lang.code.length).toBeGreaterThan(0);
      expect(typeof lang.englishName).toBe("string");
    }
  });
});

describe("lookupByName", () => {
  it("C7 — 'haus' matches Hausa by englishName prefix", () => {
    const results = lookupByName("haus");
    const codes = results.map((r) => r.code);
    expect(codes).toContain("ha");
  });

  it("C8 — autonym search finds the language whose autonym matches", () => {
    // Hausa autonym is "Hausa" — search by a portion of the autonym
    const results = lookupByName("Hausa");
    const codes = results.map((r) => r.code);
    expect(codes).toContain("ha");

    // Hindi autonym is "हिन्दी" — search by autonym prefix
    const hindiResults = lookupByName("हिन्दी");
    const hindiCodes = hindiResults.map((r) => r.code);
    expect(hindiCodes).toContain("hi");
  });

  it("C9 — empty query returns []", () => {
    expect(lookupByName("")).toStrictEqual([]);
  });

  it("C11 — an alternate English name surfaces the entry (spec 030 alt-name resolution)", () => {
    // ab (Abkhaz) carries the alternate name "Abkhazian" (pinned 99b856b); the
    // primary englishName is "Abkhaz", so this can only match via englishNames[].
    const results = lookupByName("Abkhazian");
    expect(results.map((r) => r.code)).toContain("ab");
    // Prefix of the alternate also surfaces it (English-prefix tier).
    expect(lookupByName("Abkhazi").map((r) => r.code)).toContain("ab");
    // Mid-string fragment of the alternate surfaces it via the substring tier
    // (altSub): "khazi" is inside "Abkhazian" but neither prefixes it nor
    // appears in the primary "Abkhaz" (no "i"), so only altSub can match.
    expect(lookupByName("khazi").map((r) => r.code)).toContain("ab");
  });
});

// ---------------------------------------------------------------------------
// spec 030 — extended fields (englishNames[], localNames[], summary regionName)
// Exemplars are stable against the pinned langtags commit 99b856b.
// ---------------------------------------------------------------------------

describe("langtags extended fields (spec 030)", () => {
  it("exposes englishNames[] with the primary first, de-duplicated, alternates retained", () => {
    const ab = getLanguageDefaults("ab");
    expect(ab).not.toBeNull();
    expect(ab!.englishName).toBe("Abkhaz");
    expect(ab!.englishNames?.[0]).toBe("Abkhaz"); // primary first
    expect(ab!.englishNames).toContain("Abkhazian"); // alternate retained
    expect(new Set(ab!.englishNames).size).toBe(ab!.englishNames!.length); // de-duped
  });

  it("exposes localNames[] (own-script) with the primary autonym first; primary autonym unchanged", () => {
    const ab = getLanguageDefaults("ab");
    expect(ab!.localNames?.[0]).toBe(ab!.autonym); // primary autonym first
    expect(ab!.localNames!.length).toBeGreaterThan(1); // alternates retained
    expect(ab!.autonym).toBe("Аԥсшәа"); // back-compat: singular primary unchanged
  });

  it("omits localNames when the language has no recorded own-script name (the ~60% majority)", () => {
    const arum = getLanguageDefaults("aab"); // Arum — englishNames present, no local name
    expect(arum).not.toBeNull();
    expect(arum!.englishNames).toContain("Arum");
    expect(arum!.localNames).toBeUndefined();
    expect(arum!.autonym).toBeUndefined();
  });

  it("summaries carry regionName so homonym languages can be disambiguated in the picker", () => {
    const [ab] = lookupByName("ab"); // exact code match
    expect(ab?.code).toBe("ab");
    expect(ab?.regionName).toBe("Georgia");
  });

  it("back-compat — a single-local-name language keeps englishName/autonym and arrays the local name", () => {
    const ha = getLanguageDefaults("ha");
    expect(ha!.englishName).toBe("Hausa");
    expect(ha!.autonym).toBe("Hausa");
    expect(ha!.defaultScript).toBe("Latn");
    expect(ha!.localNames).toEqual(["Hausa"]);
  });

  it("attaches regionVariants (distinct regions, each with region/regionName) for a region-ambiguous language", () => {
    const aa = getLanguageDefaults("aa"); // Afar — spoken in ET + DJ
    expect(aa?.regionVariants).toBeDefined();
    expect(aa!.regionVariants!.length).toBeGreaterThan(1);
    const regions = aa!.regionVariants!.map((v) => v.region);
    expect(new Set(regions).size).toBe(regions.length); // regions are distinct
    expect(aa!.regionVariants!.every((v) => typeof v.region === "string")).toBe(true);
    expect(aa!.regionVariants!.some((v) => v.regionName === "Djibouti")).toBe(true);
  });

  it("omits regionVariants for a single-region language", () => {
    const hi = getLanguageDefaults("hi"); // Hindi — single dominant region
    expect(hi).not.toBeNull();
    expect(hi!.regionVariants).toBeUndefined();
  });

  it("lookupByName sets hasRegionVariants iff the subtag has >1 region variant", () => {
    expect(lookupByName("aa")[0]?.hasRegionVariants).toBe(true);
    expect(lookupByName("hi")[0]?.hasRegionVariants).toBeUndefined();
  });
});
