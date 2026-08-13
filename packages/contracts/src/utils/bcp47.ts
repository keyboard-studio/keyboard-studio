// ---------------------------------------------------------------------------
// Shared BCP47 helpers — a single canonical place for tag parsing so engine
// and studio consumers use the same logic instead of near-identical private
// copies (see scriptSubtagOf's docstring for the callers this replaces).
// ---------------------------------------------------------------------------

import type { LanguageDefaults } from "../langtags";

/**
 * Explicit ISO 15924 script subtag embedded in a BCP47 tag (e.g. the "Latn"
 * in "az-Latn"), if present. BCP47 script subtags are exactly 4 alpha chars,
 * appearing after the primary language subtag; this loops over every
 * hyphen-split part after the primary (not just the immediate next one — a
 * tag like "lif-x-Deva" or one with an intervening extlang subtag still needs
 * scanning) and returns the first 4-alpha match, title-cased.
 *
 * Single canonical implementation — was previously duplicated (with a
 * near-identical loop) in engine's characterMap.ts (explicitScriptSubtag),
 * engine's suggestMissing.ts (effectiveScriptIsLatin's inline loop), and
 * studio's suggestBase.ts (hasExplicitScriptSubtag).
 *
 * @param tag  Full BCP47 tag, e.g. "az-Latn" or "hi".
 * @returns  The title-cased 4-letter script subtag, or `undefined` if none is
 *           present (a bare primary-language tag, or one whose only following
 *           subtags are region/variant codes).
 */
export function scriptSubtagOf(tag: string): string | undefined {
  const parts = tag.split("-");
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part !== undefined && /^[A-Za-z]{4}$/.test(part)) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
  }
  return undefined;
}

/**
 * Resolves the ISO 15924 script code for a BCP47 tag: an explicit script
 * subtag (`scriptSubtagOf`) wins; otherwise falls back to the langtags
 * default script for the tag's primary language subtag.
 *
 * The langtags lookup is a caller-supplied accessor rather than a direct
 * import, because callers reach that data through very different paths —
 * engine's characterMap.ts imports it eagerly; the studio lazy-loads a
 * separate chunk it deliberately keeps out of the initial bundle
 * (FR-011/SC-005) — and this helper must not force either loading strategy.
 * Pass `null`/`undefined` from the accessor to mean "unknown or not yet
 * loaded"; this function does not distinguish the two, since neither can
 * contribute a script.
 *
 * Single canonical algorithm — was previously duplicated (with the same
 * explicit-wins-else-langtags-default logic) in engine's characterMap.ts
 * (`resolveScript`) and studio's irToCarveNodes.ts (`targetScriptIsLatin`).
 * Callers that need a Latin/non-Latin verdict rather than the raw script
 * code (e.g. studio's fail-open-to-Latin behavior on an absent tag or an
 * unloaded module) apply that interpretation on top of this function's
 * result themselves — it is caller-specific, not part of the shared algorithm.
 *
 * @param bcp47 Full BCP47 tag, or null/undefined/empty for "no tag known".
 * @param getLanguageDefaults Accessor returning the langtags default record
 *   for a primary subtag (case-insensitive), or null/undefined if unknown or
 *   not yet loaded.
 * @returns The ISO 15924 script code, or undefined if it cannot be resolved.
 */
export function resolveEffectiveScript(
  bcp47: string | null | undefined,
  getLanguageDefaults: (primarySubtag: string) => LanguageDefaults | null | undefined,
): string | undefined {
  if (!bcp47) return undefined;
  const explicit = scriptSubtagOf(bcp47);
  if (explicit !== undefined) return explicit;
  const primary = bcp47.split("-")[0] ?? "";
  return getLanguageDefaults(primary)?.defaultScript;
}
