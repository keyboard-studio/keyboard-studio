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
});

describe("the singular autonym/englishName fields are NFC-normalized (spec 030)", () => {
  // The singular convenience fields must share the NFC form dedupeNames emits
  // for the arrays, so autonym === localNames[0] byte-for-byte (regression:
  // singular fields were built from raw source and could be NFD, e.g. dtn).
  it("the singular autonym/englishName fields are themselves NFC and match their array head", () => {
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
  // FR-014). The emitted (defaultScript, autonym) pair must also come from the
  // SAME (script-eligible) tagset — Braille/derived-script tagsets are ineligible
  // to win that slot, so a first-seen Braille tagset can no longer pair its
  // (nonexistent) script with another tagset's autonym.
  it("retains a same-region variant's own-script name that a region-only dedupe would drop, and sources defaultScript from the same eligible tagset as the autonym", () => {
    const az = getLanguageDefaults("az"); // Azerbaijani — IR has Brai + Arab tagsets
    expect(az?.regionVariants).toBeDefined();
    const ir = az!.regionVariants!.find((v) => v.region === "IR");
    expect(ir).toBeDefined();
    // Before the fix the first-seen IR tagset (Brai, no localname) won the
    // primary slot, so IR emitted defaultScript "Brai" paired with the
    // Arabic-script autonym recovered from the other tagset — a mismatch.
    expect(ir!.defaultScript).toBe("Arab");
    expect(ir!.autonym).toBe("تۆرکجه");
    expect(ir!.localNames.length).toBeGreaterThan(0);
    expect(ir!.localNames).toContain(ir!.autonym);
    // localNames orders the selected tagset's own autonym first — the union
    // of co-located names must not reorder it behind an alternate.
    expect(ir!.localNames[0]).toBe(ir!.autonym);
  });

  it("adopts a consistent script+name primary pair for other co-located languages too (ar/SA, ar/SY)", () => {
    // Same shape as az/IR: first-seen SA/SY tagsets are Braille/Hebrew-derived
    // with no name; the real Arab orthography tagset must win the primary slot.
    const ar = getLanguageDefaults("ar")!.regionVariants!;
    for (const region of ["SA", "SY"]) {
      const v = ar.find((x) => x.region === region)!;
      expect(v.defaultScript, `ar/${region}`).toBe("Arab");
      expect(v.localNames[0], `ar/${region}`).toBe(v.autonym);
    }
  });
});

describe("region variants with no script-eligible tagset emit no fabricated script/autonym (spec 030)", () => {
  // aln (Gheg Albanian) AL region has ONLY a Braille tagset on record (no
  // Latin/other real-script tagset for AL); XK has a genuine Latin tagset.
  // Per the 2d rule: if NO tagset in a (bare, region) group is script-eligible,
  // defaultScript/autonym must stay undefined and localNames must be empty —
  // never fabricated, and never leaked in from another region's tagset.
  it("aln/AL (Braille-only) has no defaultScript/autonym and empty localNames", () => {
    const aln = getLanguageDefaults("aln");
    expect(aln?.regionVariants).toBeDefined();
    const al = aln!.regionVariants!.find((v) => v.region === "AL");
    expect(al).toBeDefined();
    expect(al!.defaultScript).toBeUndefined();
    expect(al!.autonym).toBeUndefined();
    expect(al!.localNames).toEqual([]);
  });

  it("aln/XK (contrast — a genuine Latin tagset) does get a defaultScript", () => {
    const aln = getLanguageDefaults("aln");
    const xk = aln!.regionVariants!.find((v) => v.region === "XK");
    expect(xk).toBeDefined();
    expect(xk!.defaultScript).toBe("Latn");
  });
});

describe("region variants source (defaultScript, autonym, localNames) from ONE eligible tagset when two real scripts co-locate (spec 030)", () => {
  // aeb (Tunisian Arabic) TN region has TWO genuinely-eligible, non-excluded
  // scripts on record for the same region: an Arabic-script tagset (the
  // language's top-level default script) and a Latin-script romanization
  // tagset — both real scripts a co-located community writes in, unlike the
  // Braille/derived-script exclusions covered above. The selection rule must
  // pick ONE of them (the one matching the top-level defaultScript, per
  // priority (a)) to source defaultScript+autonym, while localNames still
  // unions both tagsets' own-script names.
  it("aeb/TN selects the Arabic-script tagset for (defaultScript, autonym) and unions both tagsets' names into localNames", () => {
    const aeb = getLanguageDefaults("aeb");
    expect(aeb?.regionVariants).toBeDefined();
    const tn = aeb!.regionVariants!.find((v) => v.region === "TN");
    expect(tn).toBeDefined();
    // Selected tagset is the Arabic one (matches aeb's top-level defaultScript).
    expect(tn!.defaultScript).toBe("Arab");
    expect(tn!.autonym).toBe("تونسي");
    // autonym is script-consistent with the selected tagset (Arabic text, not
    // the Latin romanization "Derja").
    expect(tn!.autonym).not.toBe("Derja");
    // localNames unions BOTH tagsets' own-script names — the Arabic autonym
    // first, then the Latin-script tagset's own name "Derja" — even though
    // only the Arabic tagset won the primary (defaultScript, autonym) slot.
    expect(tn!.localNames).toEqual(["تونسي", "Derja"]);
  });
});

describe("region variants never let a non-primary script win the primary slot (spec 030)", () => {
  // Braille and the ISO 15924 unwritten/undetermined/inherited/uncoded
  // placeholder scripts are derived/auxiliary encodings, not a script a
  // co-located community actually writes in. They must never surface as a
  // region variant's defaultScript, and whenever a variant carries both
  // defaultScript and autonym, the pair must be internally consistent — at
  // minimum, defaultScript must not be one of these excluded scripts. This is
  // a data-driven scan (not a fixed pin list) so a future langtags pin that
  // attaches a localname to a Braille/undetermined tagset cannot silently let
  // it win the primary slot again.
  const NON_PRIMARY_SCRIPTS = new Set(["Brai", "Dupl", "Zxxx", "Zyyy", "Zinh", "Zzzz"]);

  it("no regionVariant.defaultScript is a non-primary/derived script, across every language", () => {
    const offenders: string[] = [];
    for (const summary of listLanguages()) {
      const d = getLanguageDefaults(summary.code);
      if (d === null) continue;
      for (const v of d.regionVariants ?? []) {
        if (v.defaultScript !== undefined && NON_PRIMARY_SCRIPTS.has(v.defaultScript)) {
          offenders.push(`${d.code}/${v.region} defaultScript=${v.defaultScript}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
