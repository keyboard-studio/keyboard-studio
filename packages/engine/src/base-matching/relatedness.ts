// Pure language-relatedness computation (spec §8 step 1). Given two language
// codes and the pinned relatedness data (artifact B — macrolanguage parent,
// genealogical family path, countries), decide the strongest relatedness tier
// between them. No I/O; the caller supplies the parsed data map.
//
// These tiers are *priors*: relatedness predicts shared orthography. The
// character-overlap evidence (rankRelated.ts) confirms whether a prior pays off.

import type {
  LanguageRelatednessRecord,
  RelatednessTier,
} from "@keyboard-studio/contracts";

/** Primary language subtag of a BCP47 tag, lowercased (`"bm-Latn"` → `"bm"`). */
export function primarySubtag(tag: string): string {
  return (tag.split("-")[0] ?? "").toLowerCase();
}

/** The relatedness verdict for one (target, candidate) language-code pair. */
export interface PairRelatedness {
  tier: RelatednessTier;
  /** A shared ISO 3166 country code, when geographic co-residence contributed. */
  sharedCountry?: string;
}

const UNRELATED: PairRelatedness = { tier: "unrelated" };

/** True when the two languages are dialect siblings under one macrolanguage. */
function sameMacrolanguage(
  a: LanguageRelatednessRecord,
  b: LanguageRelatednessRecord,
): boolean {
  if (a.macrolanguage !== undefined && a.macrolanguage === b.macrolanguage) {
    return true;
  }
  // One is the macrolanguage of the other (e.g. man ⊃ bm).
  if (a.macrolanguage !== undefined && a.macrolanguage === b.code) return true;
  if (b.macrolanguage !== undefined && b.macrolanguage === a.code) return true;
  return false;
}

/**
 * Genealogical tier from two family paths (root-first). `same-genus` when the
 * deepest nodes agree; `same-family` when only the roots agree; otherwise null.
 */
function genealogicalTier(
  a: string[] | undefined,
  b: string[] | undefined,
): RelatednessTier | null {
  if (a === undefined || b === undefined || a.length === 0 || b.length === 0) {
    return null;
  }
  const aLeaf = a[a.length - 1];
  const bLeaf = b[b.length - 1];
  if (aLeaf !== undefined && aLeaf === bLeaf) return "same-genus";
  if (a[0] !== undefined && a[0] === b[0]) return "same-family";
  return null;
}

/** First shared country code, if any. */
function sharedCountry(
  a: LanguageRelatednessRecord,
  b: LanguageRelatednessRecord,
): string | undefined {
  const bSet = new Set(b.countries ?? []);
  return (a.countries ?? []).find((c) => bSet.has(c));
}

/**
 * Strongest relatedness tier between two language codes. Resolves each code to
 * its {@link LanguageRelatednessRecord} via `data`; a missing record degrades
 * gracefully to `unrelated` (Phase 1 sparse-data tolerance — the
 * character-overlap evidence in rankRelated.ts can still surface the candidate).
 *
 * Precedence: same-macrolanguage → same-genus → same-family → co-resident →
 * unrelated. A shared country is reported whenever the two co-reside, even when
 * a stronger genealogical tier wins (it still labels the suggestion's region).
 */
export function pairRelatedness(
  targetCode: string,
  candidateCode: string,
  data: ReadonlyMap<string, LanguageRelatednessRecord>,
): PairRelatedness {
  if (targetCode === candidateCode) {
    // Same language — not "related"; the exact-language tier handles this.
    return UNRELATED;
  }
  const a = data.get(targetCode);
  const b = data.get(candidateCode);
  if (a === undefined || b === undefined) return UNRELATED;

  const country = sharedCountry(a, b);
  const withCountry = (tier: RelatednessTier): PairRelatedness =>
    country !== undefined ? { tier, sharedCountry: country } : { tier };

  if (sameMacrolanguage(a, b)) return withCountry("same-macrolanguage");

  const geneal = genealogicalTier(a.familyPath, b.familyPath);
  if (geneal !== null) return withCountry(geneal);

  if (country !== undefined) return { tier: "co-resident", sharedCountry: country };

  return UNRELATED;
}

/** Numeric prior for a tier, in [0, 1]. Used to blend with overlap evidence. */
export const TIER_PRIOR: Record<RelatednessTier, number> = {
  "same-macrolanguage": 1.0,
  "same-genus": 0.8,
  "same-family": 0.5,
  "co-resident": 0.4,
  "character-overlap": 0.2,
  unrelated: 0.0,
};
