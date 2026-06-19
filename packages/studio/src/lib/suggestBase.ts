// Base-keyboard suggestion for the hybrid flow's base-resolution step
// (spec §8 "Base resolution", workflow-model.md). Given the target *(language,
// script) pair* from identity-lite, rank the available base keyboards:
// language-match > related-language-match > script-match > language-cross-script > US-QWERTY fallback.
//
// Language and script are decoupled (spec §8/§9): matching keys on the chosen
// TARGET script, never the language's default script. So a Hindi romanization
// (hi-Latn) matches Latin bases that cover Hindi — never the Devanagari base —
// and an IPA keyboard (und-fonipa) matches Latin/IPA bases. refs #369.

import { primarySubtag } from "@keyboard-studio/engine";
import type {
  BaseKeyboard,
  RelatednessProvenance,
} from "@keyboard-studio/contracts";

/** The (language, script) target the keyboard is being authored for. */
export interface SuggestTarget {
  /**
   * BCP47 **script** subtag of the target script (e.g. "Latn", "Deva"). This is
   * the *chosen* script, which for a romanization or IPA keyboard differs from
   * the language's default script.
   */
  script: string;
  /**
   * Optional full BCP47 tag of the target, e.g. "hi-Latn", "und-fonipa". Its
   * primary language subtag drives language-aware ranking when a phonebook map
   * is supplied.
   */
  bcp47?: string;
}

export interface SuggestOptions {
  /**
   * Optional map of base-keyboard `id` → the BCP47 tags it supports (the
   * phonebook / `.kps` language list). When supplied, enables language-aware
   * ranking; when absent, suggestion falls back to script-match + fallback.
   */
  languagesById?: Record<string, readonly string[]>;
  /**
   * Optional map of base-keyboard `id` → its relatedness verdict for the target
   * language, computed by the engine base-matching module (relatedness priors
   * blended with character-overlap evidence; spec §8 step 1). When supplied, a
   * base that shares the target script and whose verdict tier is not
   * `"unrelated"` is surfaced as `related-language-match` — above bare
   * script-match and the US-QWERTY fallback — and sub-sorted by `score`. When
   * absent, ranking degrades to the language/script tiers only.
   */
  relatednessById?: Record<string, RelatednessProvenance>;
  /** Id of the guaranteed US-QWERTY fallback. Default `"basic_kbdus"`. */
  fallbackId?: string;
}

export type SuggestReason =
  | "language-match"
  | "related-language-match"
  | "script-match"
  | "language-cross-script"
  | "us-qwerty-fallback";

export interface BaseSuggestion {
  base: BaseKeyboard;
  reason: SuggestReason;
  /**
   * The relatedness verdict that produced a `related-language-match`, carried
   * through so the picker can explain *why* (related language, shared region,
   * character overlap) and show a strength badge. Present only for
   * `related-language-match` suggestions.
   */
  relatedness?: RelatednessProvenance;
}

const DEFAULT_FALLBACK_ID = "basic_kbdus";

/**
 * True when the BCP47 tag carries an explicit ISO 15924 script subtag (a
 * 4-letter token after the primary language subtag, e.g. `hi-Latn` → true,
 * `ewo` → false). When the author has *explicitly* picked a script, the
 * language-cross-script tier must not surface bases on other scripts —
 * that would defeat the romanization the author just chose (spec §8/§9
 * decoupling). When the tag has no script subtag the choice is open and
 * cross-script suggestions are useful.
 */
function hasExplicitScriptSubtag(tag: string): boolean {
  return tag.split("-").slice(1).some((part) => /^[A-Za-z]{4}$/.test(part));
}

const RANK: Record<SuggestReason, number> = {
  "language-match": 0,
  "related-language-match": 1,
  "script-match": 2,
  "language-cross-script": 3,
  "us-qwerty-fallback": 4,
};

/**
 * Rank base keyboards for the target (language, script) pair, best-first.
 *
 * - **language-match** — the base's `script` equals the target script AND the
 *   base supports a BCP47 tag whose primary language subtag matches the target's
 *   (requires `opts.languagesById`).
 * - **related-language-match** — the base's `script` equals the target script
 *   AND the engine's relatedness verdict (`opts.relatednessById`) for this base
 *   is not `"unrelated"`. Surfaces keyboards for *related* languages (dialect
 *   siblings, same family, regional neighbours) when the exact language has no
 *   keyboard. Sub-sorted by the verdict `score` (relatedness prior × character
 *   overlap), best-first.
 * - **script-match** — the base's `script` equals the target script.
 * - **language-cross-script** — the base supports the target language but its
 *   script differs from the target (requires `opts.languagesById`). Surfaces
 *   keyboards a language already has, on other writing systems.
 * - **us-qwerty-fallback** — the US-QWERTY base (`opts.fallbackId`), always
 *   offered last if present in `bases`, even when nothing else matches (this is
 *   the "blank" keyboard, which *is* US QWERTY).
 *
 * Each base appears once, under its best reason. Stable within a rank (input
 * order, which `BaseBrowserService` returns sorted by id).
 *
 * @param bases   Candidate base keyboards (from `BaseBrowserService.listAll`).
 * @param target  The chosen (language, script) pair from identity-lite.
 * @param opts    Optional phonebook map + fallback id.
 */
export function suggestBases(
  bases: readonly BaseKeyboard[],
  target: SuggestTarget,
  opts: SuggestOptions = {},
): BaseSuggestion[] {
  const fallbackId = opts.fallbackId ?? DEFAULT_FALLBACK_ID;
  const targetLang = target.bcp47 ? primarySubtag(target.bcp47) : undefined;
  const explicitScript =
    target.bcp47 !== undefined && hasExplicitScriptSubtag(target.bcp47);
  const langs = opts.languagesById ?? {};
  const related = opts.relatednessById ?? {};

  const classify = (base: BaseKeyboard): BaseSuggestion | null => {
    const scriptMatch = base.script === target.script;
    const languageDeclared =
      targetLang !== undefined &&
      (langs[base.id] ?? []).some((tag) => primarySubtag(tag) === targetLang);
    const langAndScriptMatch = scriptMatch && languageDeclared;
    // A genuine language+script match is the strongest signal — surface it even
    // for the fallback base (e.g. basic_kbdus genuinely covers English).
    if (langAndScriptMatch) return { base, reason: "language-match" };
    // Otherwise the US-QWERTY fallback is always the generic "blank" option,
    // ranked below every more specific tier — it must never be promoted by a
    // relatedness verdict.
    if (base.id === fallbackId) return { base, reason: "us-qwerty-fallback" };
    // related-language-match — hard script gate, then a non-"unrelated" verdict
    // from the engine. The provenance rides along for the picker to explain.
    const verdict = related[base.id];
    if (scriptMatch && verdict !== undefined && verdict.tier !== "unrelated") {
      return { base, reason: "related-language-match", relatedness: verdict };
    }
    if (scriptMatch) return { base, reason: "script-match" };
    // language-cross-script suppressed when the author explicitly picked a
    // script (e.g. hi-Latn) — surfacing the Devanagari base would defeat the
    // romanization they just chose.
    if (languageDeclared && !explicitScript) {
      return { base, reason: "language-cross-script" };
    }
    return null;
  };

  const suggestions: BaseSuggestion[] = [];
  for (const base of bases) {
    const suggestion = classify(base);
    if (suggestion !== null) suggestions.push(suggestion);
  }

  return suggestions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const byRank = RANK[a.s.reason] - RANK[b.s.reason];
      if (byRank !== 0) return byRank;
      // Within related-language-match, the stronger verdict (relatedness prior ×
      // character overlap) wins; other tiers keep stable input order.
      if (
        a.s.reason === "related-language-match" &&
        b.s.reason === "related-language-match"
      ) {
        const byScore =
          (b.s.relatedness?.score ?? 0) - (a.s.relatedness?.score ?? 0);
        if (byScore !== 0) return byScore;
      }
      return a.i - b.i;
    })
    .map(({ s }) => s);
}
