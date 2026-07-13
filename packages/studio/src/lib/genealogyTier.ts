// Genealogical base-suggestion tier (spec 036 US2, T020). Composes the
// Glottolog keyboard-base bridge on top of the existing script/language ranking
// in suggestBase.ts: a base that matches the target SCRIPT and also supports a
// genealogically-close relative of the target LANGUAGE is promoted to a distinct
// "genealogical" tier that slots between `language-match` and `script-match`.
//
// The bridge is a pure function with injected deps (glottolog never imports
// engine/studio, D8). Here we inject a langtags-backed `resolveLanguage` and the
// base-browser phonebook. We consume only the bridge's genealogical tier and
// merge it into the full `suggestBases` ranking — the existing script-match,
// language-cross-script and US-QWERTY-fallback tiers are preserved, so this is
// purely additive. (The bridge's own `script-fallback` tier is not injected: the
// studio already produces those tiers via `suggestBases`.)

import type { BaseKeyboard, LanguageDefaults } from "@keyboard-studio/contracts";
import { findKeyboardBaseCandidates } from "@keyboard-studio/glottolog/bridge";
import {
  primarySubtag,
  type BaseSuggestion,
  type SuggestReason,
  type SuggestTarget,
} from "./suggestBase.ts";

/** The `suggestBases` reasons plus the Glottolog-derived genealogical tier. */
export type ResolvedReason = SuggestReason | "genealogical";

export interface ResolvedSuggestion {
  base: BaseKeyboard;
  reason: ResolvedReason;
}

/** Genealogical slots between language-match and script-match (contract §6). */
const RESOLVED_RANK: Record<ResolvedReason, number> = {
  "language-match": 0,
  genealogical: 1,
  "script-match": 2,
  "language-cross-script": 3,
  "us-qwerty-fallback": 4,
};

/** Resolver over a langtags-style defaults lookup, matching BridgeDeps. */
export type ResolveLanguage = (
  bcp47: string,
) => { iso639p3?: string; script?: string } | null;

/**
 * Build the bridge's `resolveLanguage` from a langtags `getLanguageDefaults`.
 *
 * Resolves a BCP47 tag to its ISO 639-3 and chosen ISO 15924 script: an explicit
 * script subtag (e.g. `hi-Latn`) wins; otherwise the language's default script
 * (e.g. `hi` → `Deva`). Returns `null` when neither can be determined.
 */
export function makeResolveLanguage(
  getLanguageDefaults: (subtag: string) => LanguageDefaults | null,
): ResolveLanguage {
  return (bcp47: string) => {
    const primary = primarySubtag(bcp47);
    const defaults = getLanguageDefaults(primary);
    const explicit = bcp47
      .split("-")
      .slice(1)
      .find((part) => /^[A-Za-z]{4}$/.test(part));
    const script = explicit !== undefined ? normalizeScript(explicit) : defaults?.defaultScript;
    const iso639p3 = defaults?.iso639_3;
    if (iso639p3 === undefined && script === undefined) return null;
    return {
      ...(iso639p3 !== undefined ? { iso639p3 } : {}),
      ...(script !== undefined ? { script } : {}),
    };
  };
}

/** ISO 15924 is title-case (`latn` → `Latn`). */
function normalizeScript(subtag: string): string {
  return subtag.charAt(0).toUpperCase() + subtag.slice(1).toLowerCase();
}

/**
 * Encode the target's CHOSEN script into the bcp47 the bridge resolves, so the
 * bridge enforces coincidence against the script the author picked (which for a
 * romanization or IPA keyboard differs from the language's default script).
 */
function bridgeTargetTag(target: SuggestTarget): string {
  const primary = target.bcp47 ? primarySubtag(target.bcp47) : "und";
  return `${primary}-${target.script}`;
}

export interface GenealogyDeps {
  resolveLanguage: ResolveLanguage;
  /** Phonebook: base id → declared BCP47 tags (same shape suggestBases uses). */
  languagesById: Readonly<Record<string, readonly string[]>>;
}

/**
 * Merge the Glottolog genealogical tier into an existing `suggestBases` ranking.
 *
 * A `script-match` base that also supports a genealogically-close relative of the
 * target is promoted to `genealogical` and ranked ahead of the remaining pure
 * script-matches (closest relative first). All other tiers are preserved and
 * re-sorted under the extended precedence. `language-match` is never downgraded —
 * the target's own language is a stronger signal than a relative.
 *
 * Pure and total: with an empty phonebook or a target that resolves to no ISO,
 * it returns the input suggestions unchanged (no genealogical promotions).
 */
export function applyGenealogicalTier(
  suggestions: readonly BaseSuggestion[],
  target: SuggestTarget,
  deps: GenealogyDeps,
): ResolvedSuggestion[] {
  const candidates = findKeyboardBaseCandidates(
    { bcp47: bridgeTargetTag(target) },
    { resolveLanguage: deps.resolveLanguage, languagesById: deps.languagesById },
  );

  // Bridge order within the genealogical tier is closest-relative-first; keep it
  // as the intra-tier tie-break so a closer relative outranks a farther one.
  const genealogicalOrder = new Map<string, number>();
  candidates
    .filter((c) => c.tier === "genealogical")
    .forEach((c, i) => genealogicalOrder.set(c.keyboardId, i));

  const resolved: ResolvedSuggestion[] = suggestions.map((s) =>
    s.reason === "script-match" && genealogicalOrder.has(s.base.id)
      ? { base: s.base, reason: "genealogical" }
      : { base: s.base, reason: s.reason },
  );

  return resolved
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const tierDelta = RESOLVED_RANK[a.s.reason] - RESOLVED_RANK[b.s.reason];
      if (tierDelta !== 0) return tierDelta;
      if (a.s.reason === "genealogical" && b.s.reason === "genealogical") {
        return (
          (genealogicalOrder.get(a.s.base.id) ?? 0) -
          (genealogicalOrder.get(b.s.base.id) ?? 0)
        );
      }
      return a.i - b.i; // stable within a tier
    })
    .map(({ s }) => s);
}
