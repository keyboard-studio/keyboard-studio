// Base-keyboard suggestion for the hybrid flow's base-resolution step
// (spec §8 "Base resolution", workflow-model.md). Given the target *(language,
// script) pair* from identity-lite, rank the available base keyboards:
// language-match > script-match > US-QWERTY fallback.
//
// Language and script are decoupled (spec §8/§9): matching keys on the chosen
// TARGET script, never the language's default script. So a Hindi romanization
// (hi-Latn) matches Latin bases that cover Hindi — never the Devanagari base —
// and an IPA keyboard (und-fonipa) matches Latin/IPA bases. refs #369.

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { scriptSubtagOf } from "@keyboard-studio/contracts";

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

/** Primary language subtag of a BCP47 tag, lowercased (`"hi-Latn"` → `"hi"`). */
export function primarySubtag(tag: string): string {
  const first = tag.split("-")[0] ?? "";
  return first.toLowerCase();
}

/**
 * True when the BCP47 tag carries an explicit ISO 15924 script subtag (a
 * 4-letter token after the primary language subtag, e.g. `hi-Latn` → true,
 * `ewo` → false). When the author has *explicitly* picked a script, the
 * language-cross-script tier must not surface bases on other scripts —
 * that would defeat the romanization the author just chose (spec §8/§9
 * decoupling). When the tag has no script subtag the choice is open and
 * cross-script suggestions are useful.
 */
export function hasExplicitScriptSubtag(tag: string): boolean {
  return scriptSubtagOf(tag) !== undefined;
}

export interface SuggestOptions {
  /**
   * Optional map of base-keyboard `id` → the BCP47 tags it supports (the
   * phonebook / `.kps` language list). When supplied, enables language-aware
   * ranking; when absent, suggestion falls back to script-match + fallback.
   */
  languagesById?: Record<string, readonly string[]>;
  /** Id of the guaranteed US-QWERTY fallback. Default `"basic_kbdus"`. */
  fallbackId?: string;
}

export type SuggestReason =
  | "language-match-monolingual"
  | "language-match-multilingual"
  | "script-match"
  | "language-cross-script"
  | "us-qwerty-fallback";

export interface BaseSuggestion {
  base: BaseKeyboard;
  reason: SuggestReason;
}

const DEFAULT_FALLBACK_ID = "basic_kbdus";

const RANK: Record<SuggestReason, number> = {
  "language-match-monolingual": 0,
  "language-match-multilingual": 1,
  "script-match": 2,
  "language-cross-script": 3,
  "us-qwerty-fallback": 4,
};

/**
 * Alphabetical tie-break within a tier: case-insensitive by display name, then
 * by id for determinism. Used to order the same-script tier alphabetically.
 */
export function byDisplayName(a: BaseKeyboard, b: BaseKeyboard): number {
  return (
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }) || a.id.localeCompare(b.id)
  );
}

/**
 * Rank base keyboards for the target (language, script) pair, best-first.
 *
 * - **language-match-monolingual** — the base's `script` equals the target
 *   script AND the base's *only* declared language is the target language (its
 *   declared tags resolve to a single distinct primary subtag). A keyboard built
 *   for exactly this language is the strongest starting point.
 * - **language-match-multilingual** — same script + target-language match, but
 *   the base also declares other languages. Still a genuine match, ranked just
 *   below a dedicated single-language keyboard.
 * - **script-match** — the base's `script` equals the target script. Ordered
 *   alphabetically by display name within the tier.
 * - **language-cross-script** — the base supports the target language but its
 *   script differs from the target (requires `opts.languagesById`). Surfaces
 *   keyboards a language already has, on other writing systems.
 * - **us-qwerty-fallback** — the US-QWERTY base (`opts.fallbackId`), always
 *   offered last if present in `bases`, even when nothing else matches (this is
 *   the "blank" keyboard, which *is* US QWERTY).
 *
 * Each base appears once, under its best (first-matching) reason. Stable within
 * a rank (input order, which `BaseBrowserService` returns sorted by id) except
 * the alphabetical script-match tier.
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

  const reasonFor = (base: BaseKeyboard): SuggestReason | null => {
    const scriptMatch = base.script === target.script;
    const declaredLangs = langs[base.id] ?? [];
    const languageDeclared =
      targetLang !== undefined &&
      declaredLangs.some((tag) => primarySubtag(tag) === targetLang);
    const langAndScriptMatch = scriptMatch && languageDeclared;
    // A genuine language+script match is the strongest signal — surface it even
    // for the fallback base (e.g. basic_kbdus genuinely covers English). Split
    // monolingual (dedicated to just this language) from multilingual so a
    // single-language keyboard is offered ahead of a broader one.
    if (langAndScriptMatch) {
      const distinctLangs = new Set(declaredLangs.map(primarySubtag));
      return distinctLangs.size <= 1
        ? "language-match-monolingual"
        : "language-match-multilingual";
    }
    // Otherwise the US-QWERTY fallback is always the generic "blank" option,
    // ranked below script and language-cross-script — a more specific base
    // should win.
    if (base.id === fallbackId) return "us-qwerty-fallback";
    if (scriptMatch) return "script-match";
    // language-cross-script suppressed when the author explicitly picked a
    // script (e.g. hi-Latn) — surfacing the Devanagari base would defeat the
    // romanization they just chose.
    if (languageDeclared && !explicitScript) return "language-cross-script";
    return null;
  };

  const suggestions: BaseSuggestion[] = [];
  for (const base of bases) {
    const reason = reasonFor(base);
    if (reason !== null) suggestions.push({ base, reason });
  }

  return suggestions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const rankDelta = RANK[a.s.reason] - RANK[b.s.reason];
      if (rankDelta !== 0) return rankDelta;
      // Same-script languages are ordered alphabetically; every other tier keeps
      // input order (stable), which BaseBrowserService returns sorted by id.
      if (a.s.reason === "script-match") return byDisplayName(a.s.base, b.s.base);
      return a.i - b.i;
    })
    .map(({ s }) => s);
}
