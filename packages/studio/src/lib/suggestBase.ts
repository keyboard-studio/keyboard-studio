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
  /** Id of the guaranteed US-QWERTY fallback. Default `"basic_kbdus"`. */
  fallbackId?: string;
}

export type SuggestReason =
  | "language-match"
  | "script-match"
  | "us-qwerty-fallback";

export interface BaseSuggestion {
  base: BaseKeyboard;
  reason: SuggestReason;
}

const DEFAULT_FALLBACK_ID = "basic_kbdus";

/** Primary language subtag of a BCP47 tag, lowercased (`"hi-Latn"` → `"hi"`). */
function primarySubtag(tag: string): string {
  const first = tag.split("-")[0] ?? "";
  return first.toLowerCase();
}

const RANK: Record<SuggestReason, number> = {
  "language-match": 0,
  "script-match": 1,
  "us-qwerty-fallback": 2,
};

/**
 * Rank base keyboards for the target (language, script) pair, best-first.
 *
 * - **language-match** — the base's `script` equals the target script AND the
 *   base supports a BCP47 tag whose primary language subtag matches the target's
 *   (requires `opts.languagesById`).
 * - **script-match** — the base's `script` equals the target script.
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
  const langs = opts.languagesById ?? {};

  const reasonFor = (base: BaseKeyboard): SuggestReason | null => {
    const scriptMatch = base.script === target.script;
    const langMatch =
      scriptMatch &&
      targetLang !== undefined &&
      (langs[base.id] ?? []).some((tag) => primarySubtag(tag) === targetLang);
    // A genuine language match is the strongest signal — surface it even for the
    // fallback base (e.g. basic_kbdus genuinely covers English).
    if (langMatch) return "language-match";
    // Otherwise the US-QWERTY fallback is always the generic "blank" option,
    // ranked last even when it happens to match the script — a more specific
    // base should win.
    if (base.id === fallbackId) return "us-qwerty-fallback";
    if (scriptMatch) return "script-match";
    return null;
  };

  const suggestions: BaseSuggestion[] = [];
  for (const base of bases) {
    const reason = reasonFor(base);
    if (reason !== null) suggestions.push({ base, reason });
  }

  return suggestions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => RANK[a.s.reason] - RANK[b.s.reason] || a.i - b.i)
    .map(({ s }) => s);
}
