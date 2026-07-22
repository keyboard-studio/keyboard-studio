// ---------------------------------------------------------------------------
// Shared BCP47 helpers — a single canonical place for tag parsing so engine
// and studio consumers use the same logic instead of near-identical private
// copies (see scriptSubtagOf's docstring for the callers this replaces).
// ---------------------------------------------------------------------------

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
