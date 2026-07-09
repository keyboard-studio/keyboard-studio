// SIL langtags-derived language defaults.
//
// These types are additive: they are NOT part of the locked Pattern/Criterion
// contract and do not require a joint session to extend.  They supply the data
// source for specs/002-defaults-engine and specs/023-langtags-defaults.
//
// No zod schemas are provided — these are not data-file boundary types; they
// are produced only by the checked-in codegen artifact and the engine lookup
// functions, which are TS-typed end-to-end.

/**
 * Default orthography record for a single language, derived from the
 * bare-subtag tagset in silnrsi/langtags (`source/langtags.json`).
 *
 * Returned by `getLanguageDefaults(subtag)` in
 * `@keyboard-studio/engine/langtags`.
 *
 * All optional fields reflect genuine absence in the upstream data and are
 * never fabricated.  Callers must guard each optional before using it as a
 * proposal.
 *
 * @see specs/023-langtags-defaults/data-model.md
 */
export interface LanguageDefaults {
  /** Canonical bare language subtag (lowercased), e.g. `"ha"`, `"hi"`. */
  code: string;
  /** ISO 639-3 three-letter code, e.g. `"hau"`, `"hin"`. Optional — present for most languages. */
  iso639_3?: string;
  /** Default script subtag (ISO 15924), e.g. `"Latn"`, `"Deva"`. Derived from the `full` tag. */
  defaultScript?: string;
  /** Default region subtag (ISO 3166-1 alpha-2 or UN M.49), e.g. `"NG"`, `"IN"`. Derived from the `full` tag. */
  defaultRegion?: string;
  /**
   * Additional regions that share this orthography.
   * May be empty; never undefined.
   */
  regions: readonly string[];
  /** Language name in its own script (autonym), e.g. `"Hausa"`, `"हिन्दी"`. */
  autonym?: string;
  /** English name for the language, e.g. `"Hausa"`, `"Hindi"`. */
  englishName?: string;
  /**
   * All recorded English/alternate names (langtags `name` + `names[]`),
   * de-duplicated, primary (`englishName`) first. Absent when the source has
   * no names. Powers the English-name autocomplete (spec 030 FR-001).
   */
  englishNames?: readonly string[];
  /**
   * All recorded own-script names (langtags `localname` + `localnames[]`),
   * de-duplicated, primary (`autonym`) first. Frequently ABSENT — only ~40% of
   * langtags subtags carry any local name — so Q2 must degrade to free text
   * when this is empty (spec 030 FR-004/FR-005).
   */
  localNames?: readonly string[];
  /**
   * Region-distinct resolutions of this language (spec 030 FR-014). One entry
   * per region that carries its own orthography/names. `length > 1` is the
   * region-disambiguation trigger; rare (~2.6% of subtags). Absent/length-1
   * means the language is unambiguous by region.
   */
  regionVariants?: readonly RegionVariant[];
}

/**
 * A region-distinct resolution of a language (spec 030 FR-014 / data-model).
 * Produced when a bare subtag has entries differing by region.
 *
 * @see specs/030-langtags-identity-autocomplete/data-model.md
 */
export interface RegionVariant {
  /** Region subtag (ISO 3166-1 alpha-2 or UN M.49), e.g. `"NG"`, `"GE"`. */
  region: string;
  /** Country/region display name (the region-question choice label), e.g. `"Georgia"`. */
  regionName?: string;
  /** Script for this variant (ISO 15924). */
  defaultScript?: string;
  /** Primary own-script name for this variant. */
  autonym?: string;
  /** Own-script names for this variant (Q2 choices); may be empty. */
  localNames: readonly string[];
}

/**
 * Lightweight language entry backing the searchable language list.
 *
 * Returned by `listLanguages()` and `lookupByName()` in
 * `@keyboard-studio/engine/langtags`.
 *
 * @see specs/023-langtags-defaults/data-model.md
 */
export interface LanguageSummary {
  /** Canonical bare language subtag (lowercased) — the value written into the answer/BCP47. */
  code: string;
  /** English name — primary search + display label. */
  englishName: string;
  /** Autonym (language name in its own script) — secondary search term + display. */
  autonym?: string;
  /** Default script subtag (ISO 15924), used to seed the target-script proposal. */
  defaultScript?: string;
  /**
   * Region display name for this language. Lets the picker disambiguate
   * homonym languages — ~98 English names in langtags map to >1 distinct
   * language (e.g. "Ainu" → aib/ain), so a name alone is not enough to tell
   * two suggestions apart (spec 030 T008 finding). Absent when unknown.
   */
  regionName?: string;
  /**
   * True when this language's bare subtag resolves to more than one region
   * variant — i.e. a region-disambiguation step will follow (spec 030 FR-014).
   */
  hasRegionVariants?: boolean;
}

/**
 * Proposal-level provenance marker for values seeded from the langtags dataset.
 *
 * Shared primitive between specs/023 and specs/002-defaults-engine; this is
 * NOT the full `axisFills` record (which is deferred to specs/002 US5).
 *
 * @see specs/023-langtags-defaults/data-model.md
 */
export interface LangtagsProvenance {
  /** Literal discriminator in specs/002's provenance vocabulary. */
  source: "langtags";
  /** Display text shown to the author, e.g. "Suggested from langtags — edit if needed". */
  caption: string;
}
