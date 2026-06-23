// ---------------------------------------------------------------------------
// Shared Unicode codepoint utilities — a single canonical place for U+XXXX
// parsing so every consumer (engine, studio) uses the same logic.
// ---------------------------------------------------------------------------

/** Converts the first code point of `char` to a `U+XXXX` string.
 *  Precondition: `char` is a non-empty string; only the first code point is used. */
export function toUPlusNotation(char: string): string {
  const cp = char.codePointAt(0)!;
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/** Returns true when `char` is an accented letter decomposable to base + combining mark
 *  (i.e. NFD produces exactly two code points and the second is in the Combining Diacritical
 *  Marks block U+0300–U+036F). */
export function isDecomposableAccented(char: string): boolean {
  const nfd = char.normalize("NFD");
  const cps = [...nfd];
  if (cps.length !== 2) return false;
  const secondCp = cps[1]?.codePointAt(0) ?? 0;
  return secondCp >= 0x0300 && secondCp <= 0x036f;
}

/**
 * Convert a U+XXXX codepoint string (or bare hex) to the actual Unicode
 * character.
 *
 * Accepted formats:
 *   - `"U+0041"` — canonical uppercase prefix + 4–6 hex digits
 *   - `"u+0041"` — lowercase prefix (normalised internally)
 *   - `"0041"`   — bare 4–6 hex digit string with no prefix
 *
 * Returns `null` for any of:
 *   - Inputs that don't match the accepted formats
 *   - Surrogate codepoints (U+D800–U+DFFF)
 *   - Codepoints above the Unicode maximum (U+10FFFF)
 *   - Any `String.fromCodePoint` throw (out-of-range numeric value)
 *
 * @param s  The codepoint string to parse.
 * @returns  The Unicode character, or `null` if `s` is not well-formed.
 */
export function parseUPlusNotation(s: string): string | null {
  // Accept optional "U+" / "u+" prefix, then 4–6 hex digits.
  const match = /^(?:[Uu]\+)?([0-9A-Fa-f]{4,6})$/.exec(s);
  if (match === null) return null;

  const cp = parseInt(match[1]!, 16);

  // Reject surrogates (U+D800–U+DFFF) — not valid Unicode scalar values.
  if (cp >= 0xd800 && cp <= 0xdfff) return null;

  // Reject codepoints beyond the Unicode maximum.
  if (cp > 0x10ffff) return null;

  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}
