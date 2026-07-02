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
});
