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
