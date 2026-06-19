// see spec.md §8 step 1 (source selection) / §9 (three-group routing) — data
// types for related-language base-keyboard matching.
//
// Background: the source-selection step (§8 step 1) proposes an existing
// keyboard as the starting base before falling back to the blank US-English
// layout (§3c "defaults are the product" — research-by-peers). The studio's
// suggestBases() ranking (packages/studio/src/lib/suggestBase.ts) historically
// matched only on a base's *declared* BCP47 languages. These types add the
// relatedness layer: when no keyboard covers the exact target language, propose
// keyboards for *related* languages, ranked by genealogical relatedness,
// geographic co-residence, and character-inventory overlap.
//
// Contract: like KeyboardProvenance, every record here is an AUTHORING-TIME
// input only. The corpus index and relatedness data rank picker suggestions;
// they are NEVER written into the `.kmn`, the package, or the PR to
// keymanapp/keyboards. Nothing here is serialized into a keyboard artifact.

import { ImportStatus } from "./keyboard-ir.js";

/**
 * Physical base-layout family of a keyboard, inferred during the corpus scan.
 * Used as a secondary tie-breaker so QWERTY conventions are not proposed as a
 * base for an AZERTY-region language and vice versa (mirrors the §7.6 rule that
 * placement priors never cross base-layout families). `undefined` when the scan
 * could not infer one.
 */
export type BaseLayoutFamily = "QWERTY" | "AZERTY" | "QWERTZ";

/**
 * How a candidate keyboard's language relates to the target language, strongest
 * first. Drives the within-tier ordering of `related-language-match`
 * suggestions. Genealogical tiers come from the family tree (Ethnologue, Phase
 * 2) or the ISO 639-3 macrolanguage table (Phase 1); `co-resident` comes from
 * shared country/region; `character-overlap` is the Phase-1 evidence-only tier
 * used when no genealogical or geographic signal is available but the candidate
 * still shares a meaningful share of the target's characters.
 *
 * @see spec.md §8 step 1
 */
export type RelatednessTier =
  | "same-macrolanguage"
  | "same-genus"
  | "same-family"
  | "co-resident"
  | "character-overlap"
  | "unrelated";

/**
 * One entry in the pinned corpus index (artifact A — `keyboard-corpus-index.json`),
 * produced offline by the supportability scanner over `keymanapp/keyboards/release/`.
 * Lets the matcher score the whole corpus offline rather than parsing ~900 `.kps`
 * files live. Pinned/versioned like the CLDR exemplar data.
 *
 * @see spec.md §8 step 1
 */
export interface CorpusKeyboardEntry {
  /** Stable snake_case keyboard id (folder name under release/). */
  id: string;
  /** POSIX path under release/, e.g. "release/b/bambara". */
  path: string;
  /** ISO 15924 script subtag for the keyboard's primary script. */
  script: string;
  /** Inferred physical base-layout family; omitted when not inferable. */
  baseLayoutFamily?: BaseLayoutFamily;
  /** Declared BCP47 tags from the `.kps` `<Languages>` block. */
  languages: string[];
  /**
   * Distinct NFC codepoints (one JS char each) the keyboard can statically
   * produce, from `buildProducedSet(ir)`. Sorted by codepoint for stable diffs.
   */
  producedGlyphs: string[];
  /** Import fidelity from the codec round-trip (drives the cleaner-import tie-break). */
  importStatus: ImportStatus;
  /** Number of `RawKmnFragment` (opaque) nodes; lower is a cleaner base. */
  opaqueFeatureCount: number;
}

/**
 * Per-language relatedness facts (artifact B — `language-relatedness.json`),
 * produced offline from the Ethnologue dataset (Phase 2) with an open-source
 * fallback (ISO 639-3 macrolanguages + langtags, Phase 1). Keyed by the primary
 * language subtag (ISO 639-3 code). Authoring-time only.
 *
 * @see spec.md §8 step 1
 */
export interface LanguageRelatednessRecord {
  /** ISO 639-3 code (the primary language subtag this record describes). */
  code: string;
  /**
   * Macrolanguage parent (ISO 639-3), when this is an individual language under
   * a macrolanguage (e.g. `bm`/`dyu` under Manding). Two languages sharing a
   * macrolanguage are dialect siblings — the strongest relatedness signal.
   */
  macrolanguage?: string;
  /**
   * Genealogical family path, root-first
   * (e.g. ["Niger-Congo","Atlantic-Congo","Mande","Manding"]). Two languages
   * share `same-genus` when their paths agree to the deepest node, `same-family`
   * when only the roots agree.
   */
  familyPath?: string[];
  /** ISO 3166-1 alpha-2 country codes where the language is spoken. */
  countries?: string[];
}

/**
 * The relatedness verdict for one (target, candidate) language pair, plus the
 * character-overlap evidence. Produced by the engine base-matching module and
 * threaded into `suggestBases()` so the studio can rank and explain the
 * `related-language-match` tier without re-deriving the signals.
 */
export interface RelatednessProvenance {
  /** Strongest relatedness tier found between target and candidate. */
  tier: RelatednessTier;
  /** Display label of the related language (e.g. "Bambara"), for the UI string. */
  relatedLanguage?: string;
  /** Shared country/region label, when geographic co-residence contributed. */
  sharedRegion?: string;
  /** Count of the target's characters the candidate already produces. */
  sharedCharCount: number;
  /** Total distinct target characters considered (denominator for the overlap). */
  targetCharCount: number;
  /**
   * Composite confidence in [0, 1]: a weighted blend of relatedness tier
   * (prior) and character-overlap Jaccard (evidence). Drives within-tier sort
   * order and the strength badge shown in the picker.
   */
  score: number;
}
