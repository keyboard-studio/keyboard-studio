// Related-base ranking (spec §8 step 1). Blends the relatedness *prior*
// (relatedness.ts — genealogical / geographic) with the character-overlap
// *evidence* (how much of the target's character inventory a candidate keyboard
// already produces) into a per-candidate {@link RelatednessProvenance}. The
// studio threads this map into suggestBases() as `relatednessById`.
//
// Pure: the caller loads the target's character inventory (CLDR exemplars) and
// the relatedness data; this module does no I/O.

import type {
  LanguageRelatednessRecord,
  RelatednessProvenance,
  RelatednessTier,
} from "@keyboard-studio/contracts";
import { pairRelatedness, primarySubtag, TIER_PRIOR } from "./relatedness.js";

/** A candidate keyboard reduced to the fields ranking needs. */
export interface RelatedCandidate {
  id: string;
  /** Declared BCP47 tags (from the `.kps` `<Languages>` block / corpus index). */
  languages: readonly string[];
  /** Distinct NFC codepoints the keyboard can statically produce. */
  producedGlyphs: readonly string[];
}

export interface RankRelatedOptions {
  /** Below this target-coverage fraction, a non-genealogical candidate is dropped. Default 0.5. */
  overlapFloor?: number;
  /** Weight of the relatedness prior in the composite score. Default 0.5. */
  priorWeight?: number;
  /** Weight of the character-overlap evidence in the composite score. Default 0.5. */
  overlapWeight?: number;
  /** Resolve a language code to a display name (e.g. "bm" → "Bambara"). */
  nameOf?: (code: string) => string | undefined;
  /** Resolve a country code to a display name (e.g. "ML" → "Mali"). */
  regionNameOf?: (country: string) => string | undefined;
}

const DEFAULTS = {
  overlapFloor: 0.5,
  priorWeight: 0.5,
  overlapWeight: 0.5,
} as const;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Rank candidate keyboards by their fitness as a *related-language* base for the
 * target. Returns a map of `candidate.id` → {@link RelatednessProvenance} for
 * every candidate that is either genealogically/geographically related OR shares
 * at least `overlapFloor` of the target's characters. Unrelated, low-overlap
 * candidates are omitted (the studio surfaces those as bare `script-match`).
 *
 * The caller is responsible for the hard script gate — pass only candidates
 * already filtered to the target script, mirroring suggestBases()'s gate.
 *
 * @param targetTag     BCP47 tag of the target language.
 * @param targetChars   The target's character inventory (CLDR exemplars / linguist inventory).
 * @param candidates    Script-matched candidate keyboards.
 * @param data          Pinned relatedness data, keyed by ISO 639-3 code.
 * @param options       Scoring weights + name resolvers.
 */
export function rankRelatedBases(
  targetTag: string,
  targetChars: ReadonlySet<string>,
  candidates: readonly RelatedCandidate[],
  data: ReadonlyMap<string, LanguageRelatednessRecord>,
  options: RankRelatedOptions = {},
): Record<string, RelatednessProvenance> {
  const overlapFloor = options.overlapFloor ?? DEFAULTS.overlapFloor;
  const priorWeight = options.priorWeight ?? DEFAULTS.priorWeight;
  const overlapWeight = options.overlapWeight ?? DEFAULTS.overlapWeight;
  const targetCode = primarySubtag(targetTag);
  const targetCharCount = targetChars.size;

  const out: Record<string, RelatednessProvenance> = {};

  for (const cand of candidates) {
    // Strongest related language among the candidate's declared languages.
    let bestTier: RelatednessTier = "unrelated";
    let bestCode: string | undefined;
    let bestCountry: string | undefined;
    for (const tag of cand.languages) {
      const code = primarySubtag(tag);
      const pair = pairRelatedness(targetCode, code, data);
      if (TIER_PRIOR[pair.tier] > TIER_PRIOR[bestTier]) {
        bestTier = pair.tier;
        bestCode = code;
        bestCountry = pair.sharedCountry;
      }
    }

    // Character-overlap evidence: how much of the target's inventory the
    // candidate already produces.
    const produced = new Set(cand.producedGlyphs);
    let sharedCharCount = 0;
    for (const ch of targetChars) if (produced.has(ch)) sharedCharCount += 1;
    const coverage = targetCharCount === 0 ? 0 : sharedCharCount / targetCharCount;

    // Effective tier: a genealogically/geographically unrelated candidate can
    // still qualify on overlap alone (Phase-1 evidence-only tier).
    let tier = bestTier;
    if (tier === "unrelated" && coverage >= overlapFloor) {
      tier = "character-overlap";
    }
    if (tier === "unrelated") continue; // omit — studio treats as script-match

    const score = clamp01(
      priorWeight * TIER_PRIOR[tier] + overlapWeight * coverage,
    );

    const relatedLanguage =
      bestCode !== undefined
        ? (options.nameOf?.(bestCode) ?? bestCode)
        : undefined;
    const sharedRegion =
      bestCountry !== undefined
        ? (options.regionNameOf?.(bestCountry) ?? bestCountry)
        : undefined;

    out[cand.id] = {
      tier,
      sharedCharCount,
      targetCharCount,
      score,
      ...(relatedLanguage !== undefined ? { relatedLanguage } : {}),
      ...(sharedRegion !== undefined ? { sharedRegion } : {}),
    };
  }

  return out;
}

/** Build the relatedness lookup map from the parsed artifact-B records. */
export function indexRelatednessData(
  records: readonly LanguageRelatednessRecord[],
): Map<string, LanguageRelatednessRecord> {
  return new Map(records.map((r) => [r.code.toLowerCase(), r]));
}
