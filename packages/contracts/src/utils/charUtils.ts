// ---------------------------------------------------------------------------
// Shared Unicode codepoint utilities — a single canonical place for U+XXXX
// parsing so every consumer (engine, studio) uses the same logic.
// ---------------------------------------------------------------------------

/**
 * Drop keys whose value is `undefined` so the result satisfies
 * `exactOptionalPropertyTypes` (an explicit `key: undefined` is not
 * assignable to an optional field; an absent key is).
 *
 * Shared, top-level-only strip used by the package's several `makeX`
 * factories (see provenance.ts, placementMap.ts, linguistInventory.ts) that
 * each previously defined an identical private copy of this function.
 */
export function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/** Shared "4+-digit uppercase hex of a single codepoint" primitive — the pad
 *  is a minimum, so 5-6 digit astral codepoints pass through unpadded. */
export function toHex4(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, "0");
}

/** Converts the first code point of `char` to a `U+XXXX` string.
 *  Precondition: `char` is a non-empty string; only the first code point is used. */
export function toUPlusNotation(char: string): string {
  const cp = char.codePointAt(0)!;
  return "U+" + toHex4(cp);
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
 * True when `cp` is a Unicode noncharacter: the last two codepoints of every
 * plane (…FFFE/…FFFF, via the `(cp & 0xfffe) === 0xfffe` bit test, which
 * covers every plane 0-16, not just the BMP) plus the reserved Arabic-
 * presentation-forms range U+FDD0–U+FDEF. These are permanently reserved by
 * the Unicode standard and never valid for open interchange. Single
 * canonical definition — shared by parseUPlusNotation() below and the
 * character-map guardrail (characterMap.ts), where it was previously
 * duplicated. NOTE: the Layer A codepoint-format lint check
 * (validator/checks/codepointFormat.ts) intentionally keeps a NARROWER,
 * non-equivalent check (BMP-only 0xFFFE/0xFFFF special-case, matching
 * kmcmplib) and must NOT be swapped onto this all-plane helper — see the
 * comment there.
 */
export function isNoncharacterCodePoint(cp: number): boolean {
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true;
  return (cp & 0xfffe) === 0xfffe;
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
 *   - Noncharacter codepoints (the last two codepoints of every plane —
 *     …FFFE/…FFFF — plus the reserved BMP range U+FDD0–U+FDEF)
 *   - Any `String.fromCodePoint` throw (out-of-range numeric value)
 *
 * Private-use-area codepoints (e.g. U+E000) ARE accepted — PUA is a
 * legitimate escape hatch for authors, not a malformed input.
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

  // Reject noncharacters (see isNoncharacterCodePoint above).
  if (isNoncharacterCodePoint(cp)) return null;

  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}
