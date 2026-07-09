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

// ---------------------------------------------------------------------------
// spec 030 — codegen data-fidelity regressions (name de-dup + region merge)
// Exemplars are stable against the pinned langtags commit 99b856b.
// ---------------------------------------------------------------------------

describe("langtags name de-duplication is Unicode-canonical (spec 030)", () => {
  // A name array must not contain two entries that are canonically equal (NFC)
  // but byte-distinct — those render as identical-looking duplicate choices in
  // the survey picker. The codegen normalizes to NFC before de-duping.
  function hasCanonicalDuplicate(names: readonly string[] | undefined): boolean {
    if (names === undefined) return false;
    const seen = new Set<string>();
    for (const n of names) {
      const nfc = n.normalize("NFC");
      if (seen.has(nfc)) return true;
      seen.add(nfc);
    }
    return false;
  }

  it("no localNames/englishNames array (top-level or per-variant) has an NFC-duplicate", () => {
    const offenders: string[] = [];
    for (const summary of listLanguages()) {
      const d = getLanguageDefaults(summary.code);
      if (d === null) continue;
      if (hasCanonicalDuplicate(d.localNames)) offenders.push(`${d.code}.localNames`);
      if (hasCanonicalDuplicate(d.englishNames)) offenders.push(`${d.code}.englishNames`);
      for (const v of d.regionVariants ?? []) {
        if (hasCanonicalDuplicate(v.localNames)) offenders.push(`${d.code}/${v.region}.localNames`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("collapses the vi NFC-duplicate own-script name to a single entry", () => {
    // Regression: upstream vi carries localname + localnames[0] as
    // canonically-equal-but-byte-distinct NFC/NFD forms of "Tiếng Việt"; both
    // previously survived as two picker choices.
    const vi = getLanguageDefaults("vi");
    expect(vi!.localNames).toEqual(["Tiếng Việt".normalize("NFC")]);
  });

  it("the singular autonym/englishName fields are themselves NFC and match their array head", () => {
    // The singular convenience fields must share the NFC form dedupeNames emits
    // for the arrays, so autonym === localNames[0] byte-for-byte (regression:
    // singular fields were built from raw source and could be NFD, e.g. dtn).
    const offenders: string[] = [];
    for (const summary of listLanguages()) {
      const d = getLanguageDefaults(summary.code);
      if (d === null) continue;
      if (d.autonym !== undefined) {
        if (d.autonym !== d.autonym.normalize("NFC")) offenders.push(`${d.code}.autonym !NFC`);
        if (d.localNames !== undefined && d.localNames[0] !== d.autonym) offenders.push(`${d.code}.autonym!=localNames[0]`);
      }
      if (d.englishName !== undefined) {
        if (d.englishName !== d.englishName.normalize("NFC")) offenders.push(`${d.code}.englishName !NFC`);
        if (d.englishNames !== undefined && d.englishNames[0] !== d.englishName) offenders.push(`${d.code}.englishName!=englishNames[0]`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("region-variant merge preserves co-located names (spec 030)", () => {
  // When a bare subtag has more than one tagset for the SAME region (a co-located
  // multi-script community), the codegen keeps one variant per region but merges
  // every recorded own-script name into it, rather than dropping all but the
  // first tagset's names (region — not script — keys the disambiguation question,
  // FR-014).
  it("retains a same-region variant's own-script name that a region-only dedupe would drop", () => {
    const az = getLanguageDefaults("az"); // Azerbaijani — IR has Brai + Arab tagsets
    expect(az?.regionVariants).toBeDefined();
    const ir = az!.regionVariants!.find((v) => v.region === "IR");
    expect(ir).toBeDefined();
    // Before the merge fix the first-seen IR tagset (Brai) carried no localname,
    // so IR.localNames was [] and the co-located Arab tagset's name was lost.
    expect(ir!.localNames.length).toBeGreaterThan(0);
    expect(ir!.autonym).toBeDefined();
    expect(ir!.localNames[0]).toBe(ir!.autonym); // primary first
  });

  it("adopts a consistent script+name primary pair — a nameless specialty tagset does not pair a mismatched script with a name", () => {
    // Regression (km-review of this PR): the first-seen IR tagset is Braille
    // (Brai, no name); the merge must adopt the co-located Arab tagset's
    // script+name TOGETHER, not pair the Braille script tag with the Arabic name.
    const ir = getLanguageDefaults("az")!.regionVariants!.find((v) => v.region === "IR");
    expect(ir!.defaultScript).toBe("Arab"); // the named orthography's script, NOT "Brai"
    // Same shape for Arabic in Saudi Arabia / Syria (first-seen Brai / Hebr,
    // no name; real Arab orthography adopted).
    const ar = getLanguageDefaults("ar")!.regionVariants!;
    for (const region of ["SA", "SY"]) {
      const v = ar.find((x) => x.region === region)!;
      expect(v.defaultScript, `ar/${region}`).toBe("Arab");
      expect(v.localNames[0], `ar/${region}`).toBe(v.autonym);
    }
  });
});
